import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, planningSessions } from "@paperclipai/db";
import { notFound, conflict, unprocessable } from "../errors.js";
import { extractJSON, buildPlanningPrompt, buildAnswerPrompt, generateSpecMarkdown } from "./planning-utils.js";
import { planningLLMCall } from "./planning-llm.js";

/* ---------- JSONB column types ---------- */

export interface PlanningMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface PlanningQuestion {
  question: string;
  options: Array<{ id: string; label: string }>;
}

export interface PlanningSpec {
  title: string;
  summary: string;
  deliverables: string[];
  success_criteria: string[];
  constraints: Record<string, unknown>;
  execution_plan?: {
    approach: string;
    steps: string[];
  };
}

/* ---------- Service ---------- */

export function planningService(db: Db) {
  async function getExistingSession(sessionId: string) {
    const session = await db
      .select()
      .from(planningSessions)
      .where(eq(planningSessions.id, sessionId))
      .then((rows) => rows[0] ?? null);
    if (!session) throw notFound("Planning session not found");
    return session;
  }

  async function getIssueOrThrow(issueId: string) {
    const issue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!issue) throw notFound("Issue not found");
    return issue;
  }

  /**
   * Parse the LLM response JSON and update the session accordingly.
   * Returns the updated session row.
   */
  async function processLLMResponse(
    sessionId: string,
    currentMessages: PlanningMessage[],
    responseText: string,
  ) {
    const now = new Date();
    const assistantMessage: PlanningMessage = {
      role: "assistant",
      content: responseText,
      timestamp: Date.now(),
    };
    const updatedMessages = [...currentMessages, assistantMessage];

    const parsed = extractJSON(responseText);

    if (parsed && typeof parsed === "object" && "type" in parsed) {
      const obj = parsed as Record<string, unknown>;

      if (obj.type === "question") {
        const question: PlanningQuestion = {
          question: String(obj.question ?? ""),
          options: Array.isArray(obj.options)
            ? (obj.options as Array<{ id: string; label: string }>)
            : [],
        };

        return db
          .update(planningSessions)
          .set({
            messages: updatedMessages,
            currentQuestion: question,
            updatedAt: now,
          })
          .where(eq(planningSessions.id, sessionId))
          .returning()
          .then((rows) => rows[0]);
      }

      if (obj.type === "spec") {
        const spec: PlanningSpec = {
          title: String(obj.title ?? ""),
          summary: String(obj.summary ?? ""),
          deliverables: Array.isArray(obj.deliverables)
            ? (obj.deliverables as string[])
            : [],
          success_criteria: Array.isArray(obj.success_criteria)
            ? (obj.success_criteria as string[])
            : [],
          constraints:
            typeof obj.constraints === "object" && obj.constraints !== null
              ? (obj.constraints as Record<string, unknown>)
              : {},
          execution_plan:
            typeof obj.execution_plan === "object" && obj.execution_plan !== null
              ? (obj.execution_plan as { approach: string; steps: string[] })
              : undefined,
        };

        return db
          .update(planningSessions)
          .set({
            messages: updatedMessages,
            currentQuestion: null,
            spec,
            status: "completed",
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(planningSessions.id, sessionId))
          .returning()
          .then((rows) => rows[0]);
      }
    }

    // Fallback: store the raw response as a message but don't update question/spec
    return db
      .update(planningSessions)
      .set({
        messages: updatedMessages,
        updatedAt: now,
      })
      .where(eq(planningSessions.id, sessionId))
      .returning()
      .then((rows) => rows[0]);
  }

  return {
    /**
     * Start a new planning session for an issue.
     * Creates the session row, sets planningStatus='planning', and calls the LLM
     * for the first question.
     */
    startSession: async (companyId: string, issueId: string) => {
      const issue = await getIssueOrThrow(issueId);

      if (issue.companyId !== companyId) {
        throw unprocessable("Issue does not belong to company");
      }

      // Check for existing active session
      const existing = await db
        .select()
        .from(planningSessions)
        .where(
          and(
            eq(planningSessions.issueId, issueId),
            eq(planningSessions.status, "active"),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (existing) {
        throw conflict("Issue already has an active planning session");
      }

      const now = new Date();

      // Create the session
      const [session] = await db
        .insert(planningSessions)
        .values({
          companyId,
          issueId,
          status: "active",
          messages: [],
          currentQuestion: null,
        })
        .returning();

      // Update issue planning status and link
      await db
        .update(issues)
        .set({
          planningSessionId: session.id,
          planningStatus: "planning",
          updatedAt: now,
        })
        .where(eq(issues.id, issueId));

      // Call LLM for first question (async — result stored via processLLMResponse)
      const systemPrompt = buildPlanningPrompt({
        title: issue.title,
        description: issue.description,
      });

      try {
        const llmResponse = await planningLLMCall(
          [{ role: "user", content: "Please start the planning process." }],
          systemPrompt,
        );

        const initialMessages: PlanningMessage[] = [
          {
            role: "system",
            content: "Planning session started.",
            timestamp: Date.now(),
          },
        ];

        await processLLMResponse(session.id, initialMessages, llmResponse);
      } catch (err) {
        // If LLM call fails, still return the session — user can retry via poll
        const errorMessages: PlanningMessage[] = [
          {
            role: "system",
            content: "Planning session started. Waiting for first question...",
            timestamp: Date.now(),
          },
        ];
        await db
          .update(planningSessions)
          .set({
            messages: errorMessages,
            updatedAt: now,
          })
          .where(eq(planningSessions.id, session.id));
      }

      // Return the latest session state
      return getExistingSession(session.id);
    },

    /**
     * Get the current planning session for an issue.
     */
    getSession: async (issueId: string) => {
      return db
        .select()
        .from(planningSessions)
        .where(eq(planningSessions.issueId, issueId))
        .orderBy(planningSessions.createdAt)
        .then((rows) => rows[rows.length - 1] ?? null);
    },

    /**
     * Cancel the active planning session for an issue.
     * Resets the issue planning status.
     */
    cancelSession: async (issueId: string) => {
      const session = await db
        .select()
        .from(planningSessions)
        .where(
          and(
            eq(planningSessions.issueId, issueId),
            eq(planningSessions.status, "active"),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!session) {
        throw notFound("No active planning session for this issue");
      }

      const now = new Date();

      await db
        .update(planningSessions)
        .set({
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(planningSessions.id, session.id));

      await db
        .update(issues)
        .set({
          planningStatus: null,
          updatedAt: now,
        })
        .where(eq(issues.id, issueId));
    },

    /**
     * Submit a user answer for the current question.
     * Appends the answer to messages and calls LLM for the next question or spec.
     */
    submitAnswer: async (
      sessionId: string,
      answer: string,
      otherText?: string,
    ) => {
      const session = await getExistingSession(sessionId);

      if (session.status !== "active") {
        throw unprocessable("Planning session is not active");
      }

      if (!session.currentQuestion) {
        throw unprocessable("No current question to answer");
      }

      const now = new Date();
      const userMessage: PlanningMessage = {
        role: "user",
        content: otherText ? `${answer}: ${otherText}` : answer,
        timestamp: Date.now(),
      };

      const currentMessages = [
        ...((session.messages as PlanningMessage[]) ?? []),
        userMessage,
      ];

      // Clear current question while we wait for LLM
      await db
        .update(planningSessions)
        .set({
          messages: currentMessages,
          currentQuestion: null,
          updatedAt: now,
        })
        .where(eq(planningSessions.id, sessionId));

      // Build the conversation for the LLM (system prompt is separate)
      const issue = await getIssueOrThrow(session.issueId);
      const systemPrompt = buildPlanningPrompt({
        title: issue.title,
        description: issue.description,
      });

      // Convert messages to LLM format (skip system messages)
      const llmMessages = currentMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Add the answer prompt as a user message
      const answerPrompt = buildAnswerPrompt(answer, otherText);
      llmMessages.push({ role: "user", content: answerPrompt });

      try {
        const llmResponse = await planningLLMCall(llmMessages, systemPrompt);
        await processLLMResponse(sessionId, currentMessages, llmResponse);
      } catch {
        // On error, leave messages as-is; user can retry
      }

      return getExistingSession(sessionId);
    },

    /**
     * Poll for updates on a planning session.
     * Returns the current state so the frontend can check for new messages/questions.
     */
    pollForUpdates: async (sessionId: string) => {
      const session = await getExistingSession(sessionId);
      const messages = (session.messages as PlanningMessage[]) ?? [];

      return {
        sessionId: session.id,
        status: session.status,
        messages,
        currentQuestion: session.currentQuestion as PlanningQuestion | null,
        spec: session.spec as PlanningSpec | null,
        hasQuestion: session.currentQuestion !== null,
        isComplete: session.status === "completed",
        messageCount: messages.length,
      };
    },

    /**
     * Approve the completed spec and lock it into the issue.
     * Generates spec markdown, prepends to issue description,
     * and sets planningStatus='planned'.
     */
    approveSpec: async (sessionId: string) => {
      const session = await getExistingSession(sessionId);

      if (session.status !== "completed") {
        throw unprocessable("Planning session is not completed");
      }

      const spec = session.spec as PlanningSpec | null;
      if (!spec) {
        throw unprocessable("No spec available to approve");
      }

      const issue = await getIssueOrThrow(session.issueId);
      const specMarkdown = generateSpecMarkdown(
        { title: issue.title, description: issue.description },
        spec,
      );

      const now = new Date();

      // Store spec markdown on the session
      await db
        .update(planningSessions)
        .set({
          specMarkdown,
          updatedAt: now,
        })
        .where(eq(planningSessions.id, sessionId));

      // Prepend spec to issue description
      const updatedDescription = issue.description
        ? `${specMarkdown}\n${issue.description}`
        : specMarkdown;

      await db
        .update(issues)
        .set({
          description: updatedDescription,
          planningStatus: "planned",
          updatedAt: now,
        })
        .where(eq(issues.id, session.issueId));

      return { specMarkdown };
    },
  };
}
