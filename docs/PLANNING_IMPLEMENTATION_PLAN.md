# Interactive Planning for Paperclip — Implementation Plan

## Overview

Port Mission Control's interactive planning pipeline to Paperclip. In MC, an LLM orchestrator asks the user multiple-choice questions to refine a task spec before execution. In Paperclip, we adapt this so that **before an issue is executed by a heartbeat run**, a planning session can optionally gather clarification from the user via a structured Q&A flow.

### Key Differences: MC → Paperclip

| Aspect | Mission Control | Paperclip |
|---|---|---|
| DB | SQLite, raw SQL | PostgreSQL, Drizzle ORM |
| API | Next.js App Router | Express Router |
| AI Backend | OpenClaw (external) | Adapter system (claude_local, etc.) |
| Entity | `tasks` | `issues` |
| Execution | Dispatch to agent | Heartbeat wakeup + run |
| Real-time | SSE broadcast | Live events (SSE) |

---

## 1. New Database Tables

### `planning_sessions`

Tracks the lifecycle of one planning session per issue.

```typescript
// packages/db/src/schema/planning_sessions.ts
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, index,
} from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { companies } from "./companies.js";

export const planningSessions = pgTable(
  "planning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    // "active" | "completed" | "cancelled"
    messages: jsonb("messages").$type<PlanningMessage[]>().notNull().default([]),
    // Full conversation history [{role, content, timestamp}]
    currentQuestion: jsonb("current_question").$type<PlanningQuestion | null>(),
    // The latest unanswered question (denormalized for fast reads)
    spec: jsonb("spec").$type<PlanningSpec | null>(),
    // Final spec output when planning completes
    specMarkdown: text("spec_markdown"),
    // Human-readable spec (appended to issue description)
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("planning_sessions_issue_idx").on(table.issueId),
    companyStatusIdx: index("planning_sessions_company_status_idx").on(
      table.companyId, table.status,
    ),
  }),
);

// TypeScript types for the JSONB columns
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
```

### Columns to add to `issues` table

```typescript
// New columns on the existing issues table:
planningSessionId: uuid("planning_session_id")
  .references(() => planningSessions.id, { onDelete: "set null" }),
planningStatus: text("planning_status"),
  // null | "planning" | "planned" — lightweight status flag
```

### Why a single `planning_sessions` table (not separate questions/specs tables)

MC originally had `planning_questions` and `planning_specs` as separate tables but later moved to a conversation-based approach with JSON messages stored on the task itself. The conversation-based approach is cleaner because:
- The LLM drives the question flow dynamically (no predefined categories)
- A single JSONB `messages` column captures the full context
- `currentQuestion` is denormalized for fast polling
- `spec` stores the final output

One dedicated table (`planning_sessions`) is better than columns on `issues` because:
- Keeps `issues` table lean (no 6+ extra planning columns)
- Clean lifecycle management
- Supports future multi-session scenarios (re-planning)

---

## 2. New API Routes

All routes scoped under `/api/issues/:issueId/planning`.

### `POST /api/issues/:issueId/planning` — Start Planning Session

- Creates a `planning_sessions` row with status=active
- Sets `issues.planningStatus = 'planning'`
- Sends initial prompt to the agent's adapter to generate first question
- Returns `{ sessionId, messages }` immediately
- Frontend polls for the first question

### `GET /api/issues/:issueId/planning` — Get Planning State

- Returns current session: messages, currentQuestion, status, spec
- Used for initial page load

### `GET /api/issues/:issueId/planning/poll` — Poll for Updates

- Lightweight endpoint called every 2s by frontend while waiting
- Checks if a new assistant message has arrived
- Returns `{ hasUpdates, messages?, currentQuestion?, complete? }`

### `POST /api/issues/:issueId/planning/answer` — Submit Answer

- Body: `{ answer: string, otherText?: string }`
- Appends user answer to messages
- Sends answer + prompt to adapter for next question or completion
- Returns immediately; frontend polls for response

### `POST /api/issues/:issueId/planning/approve` — Lock Spec & Proceed

- Validates planning is complete
- Generates spec markdown, appends to issue description
- Sets `issues.planningStatus = 'planned'`
- Optionally triggers heartbeat wakeup for the assigned agent

### `DELETE /api/issues/:issueId/planning` — Cancel Planning

- Sets session status=cancelled
- Resets `issues.planningStatus = null`
- Clears any pending state

### Route Registration

```typescript
// server/src/routes/planning.ts
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { planningService } from "../services/planning.js";

export function planningRoutes(db: Db) {
  const router = Router({ mergeParams: true }); // mergeParams to get :issueId
  const svc = planningService(db);

  router.get("/:issueId/planning", async (req, res) => { /* ... */ });
  router.post("/:issueId/planning", async (req, res) => { /* ... */ });
  router.get("/:issueId/planning/poll", async (req, res) => { /* ... */ });
  router.post("/:issueId/planning/answer", async (req, res) => { /* ... */ });
  router.post("/:issueId/planning/approve", async (req, res) => { /* ... */ });
  router.delete("/:issueId/planning", async (req, res) => { /* ... */ });

  return router;
}
```

Mount in the main issues router or as a separate router:
```typescript
// In server/src/routes/index.ts or issues.ts
app.use("/api/issues", planningRoutes(db));
```

---

## 3. New Service Functions

### `server/src/services/planning.ts`

```typescript
export function planningService(db: Db) {
  return {
    // Session lifecycle
    startSession(companyId: string, issueId: string): Promise<PlanningSession>,
    getSession(issueId: string): Promise<PlanningSession | null>,
    cancelSession(issueId: string): Promise<void>,

    // Q&A flow
    submitAnswer(sessionId: string, answer: string, otherText?: string): Promise<void>,
    pollForUpdates(sessionId: string): Promise<PollResult>,

    // Completion
    approveSpec(sessionId: string): Promise<{ specMarkdown: string }>,

    // AI interaction (internal)
    sendToAdapter(agentId: string, sessionKey: string, prompt: string): Promise<void>,
    getAdapterResponse(agentId: string, sessionKey: string): Promise<string | null>,
  };
}
```

### `server/src/services/planning-utils.ts`

Port from MC's `planning-utils.ts`:

```typescript
/**
 * Extract JSON from LLM response that may contain markdown code blocks.
 * Handles: direct JSON, ```json ... ```, embedded {..} in text.
 */
export function extractJSON(text: string): object | null { /* ... */ }

/**
 * Build the initial planning prompt for an issue.
 */
export function buildPlanningPrompt(issue: { title: string; description: string | null }): string { /* ... */ }

/**
 * Build the answer follow-up prompt.
 */
export function buildAnswerPrompt(answer: string): string { /* ... */ }

/**
 * Generate spec markdown from a completed planning spec.
 */
export function generateSpecMarkdown(
  issue: { title: string; description: string | null },
  spec: PlanningSpec,
): string { /* ... */ }
```

### Integration with Adapter System

MC uses OpenClaw's `chat.send` / `chat.history` API. Paperclip uses its adapter system. The planning service needs to:

1. **Create a planning-specific session key**: `planning:<issueId>` 
2. **Send prompts via the adapter**: Use the assigned agent's adapter (or a dedicated planning agent/adapter) to send the prompt
3. **Poll for responses**: Check the adapter's session for new assistant messages

Two approaches:

**Option A: Dedicated planning adapter invocation (Recommended)**
- Use `heartbeatService.invoke()` with a special `contextSnapshot` that marks it as a planning run
- The agent's SOUL.md / system prompt includes planning instructions
- Response is captured via the adapter's normal output flow
- Pros: Uses existing infrastructure. Cons: Heavier weight, creates heartbeat runs.

**Option B: Direct LLM call via lightweight adapter wrapper**
- Create a thin wrapper that calls the LLM directly (e.g., Anthropic API) without going through the full heartbeat machinery
- Store the conversation in `planning_sessions.messages`
- Pros: Lightweight, fast. Cons: Bypasses adapter config, needs API key management.

**Recommended: Option B** for planning because:
- Planning is interactive and latency-sensitive (user is waiting)
- Heartbeat runs are designed for long-running autonomous work
- A lightweight LLM call is 2-5s vs full heartbeat setup overhead
- Planning doesn't need workspace, git, session management, etc.

```typescript
// server/src/services/planning-llm.ts
import Anthropic from "@anthropic-ai/sdk";

export async function planningLLMCall(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
): Promise<string> {
  // Use company's configured API key or instance default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
```

---

## 4. New UI Components

### `PlanningPanel.tsx`

Main component shown on the issue detail page (side panel or tab).

**States:**
1. **Not started** — "Start Planning" button
2. **Waiting for response** — Spinner + "Thinking..."
3. **Question displayed** — Multiple-choice options + optional "Other" text input + Submit button
4. **Complete** — Spec summary with deliverables, success criteria, "Approve & Proceed" button
5. **Cancelled** — Reset state

**Key UI elements:**
- Conversation history (scrollable list of Q&A pairs)
- Current question card with radio buttons for options
- "Other" text input (shown when "Other" option selected)
- Submit / Cancel buttons
- Spec preview card when planning completes
- Loading/polling indicator

```tsx
// Simplified component structure
function PlanningPanel({ issueId }: { issueId: string }) {
  // State: session, loading, selectedOption, otherText, isPolling
  // Effects: load session on mount, poll when waiting
  // Actions: startPlanning, submitAnswer, approveSpec, cancelPlanning

  return (
    <div>
      {/* Conversation history */}
      <ConversationHistory messages={session.messages} />

      {/* Current question or completion */}
      {session.currentQuestion && (
        <QuestionCard
          question={session.currentQuestion}
          selectedOption={selectedOption}
          otherText={otherText}
          onSelect={setSelectedOption}
          onOtherTextChange={setOtherText}
          onSubmit={submitAnswer}
          isSubmitting={isSubmitting}
        />
      )}

      {session.status === "completed" && session.spec && (
        <SpecPreview spec={session.spec} onApprove={approveSpec} />
      )}
    </div>
  );
}
```

### `QuestionCard.tsx`
- Renders question text
- Radio buttons for each option
- Conditional "Other" text input
- Submit button

### `SpecPreview.tsx`
- Renders the generated spec (title, summary, deliverables, success criteria)
- "Approve & Start Execution" button
- "Re-plan" button to restart

### `ConversationHistory.tsx`
- Scrollable list of past Q&A pairs
- User answers shown as chips/badges
- Assistant questions shown as cards

### Integration Point
Add a "Planning" tab or section to the existing issue detail view:
```tsx
// In the issue detail component
{issue.planningStatus === "planning" && <PlanningPanel issueId={issue.id} />}
// Or always show as a tab with appropriate state
<TabPanel label="Planning">
  <PlanningPanel issueId={issue.id} />
</TabPanel>
```

---

## 5. Migration Strategy

### Step 1: Database Migration

```typescript
// Drizzle migration file
import { sql } from "drizzle-orm";

export async function up(db) {
  // Create planning_sessions table
  await db.execute(sql`
    CREATE TABLE planning_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id),
      issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_question JSONB,
      spec JSONB,
      spec_markdown TEXT,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX planning_sessions_issue_idx ON planning_sessions(issue_id);
    CREATE INDEX planning_sessions_company_status_idx ON planning_sessions(company_id, status);
  `);

  // Add columns to issues
  await db.execute(sql`
    ALTER TABLE issues ADD COLUMN planning_session_id UUID REFERENCES planning_sessions(id) ON DELETE SET NULL;
    ALTER TABLE issues ADD COLUMN planning_status TEXT;
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE issues DROP COLUMN IF EXISTS planning_session_id;
    ALTER TABLE issues DROP COLUMN IF EXISTS planning_status;
    DROP TABLE IF EXISTS planning_sessions;
  `);
}
```

### Step 2: Schema Registration

Add to `packages/db/src/schema/index.ts`:
```typescript
export { planningSessions } from "./planning_sessions.js";
```

### Step 3: Feature Flag

Add a feature flag so planning can be gradually rolled out:
```typescript
// Instance settings or company settings
planningEnabled: boolean  // default: false
```

---

## 6. Integration with Heartbeat Execution Flow

### Current Flow (without planning):
```
Issue created → Status: backlog/todo → Agent assigned →
  Heartbeat wakeup → Run starts → Agent works → Run completes →
  Issue status updated
```

### New Flow (with planning):
```
Issue created → Status: backlog/todo →
  [Optional] User clicks "Plan" → Status: planning →
    Planning Q&A loop (2-5 questions) →
    Spec generated → User approves →
  Status: todo (with spec in description) → Agent assigned →
  Heartbeat wakeup → Run starts (agent sees spec) → Agent works →
  Run completes → Issue status updated
```

### Key Integration Points:

1. **Issue status**: Add `planning` as a recognized status or use the `planningStatus` field to track it orthogonally. The issue's main `status` can stay as `backlog`/`todo` while `planningStatus` tracks the planning phase separately.

2. **Spec injection**: When planning completes and is approved, the generated spec markdown is **prepended to the issue description**. This way, when the agent's heartbeat run starts, the agent naturally sees the refined spec as part of the issue context — no adapter changes needed.

3. **Auto-wakeup after approval**: Optionally, when the user approves the spec, if an agent is assigned, automatically trigger `heartbeatService.invoke()` to start execution immediately.

4. **Planning-aware issue comments**: Add a system comment to the issue when planning starts, completes, or is cancelled for audit trail:
   ```
   🗺️ Planning session started
   🗺️ Planning completed — spec locked (5 questions answered)
   ```

5. **Guard against execution during planning**: If `planningStatus === 'planning'`, the heartbeat system should skip this issue when looking for work. Add a check in the issue checkout/assignment flow:
   ```typescript
   // In issue checkout logic
   if (issue.planningStatus === 'planning') {
     throw conflict("Issue is in planning phase");
   }
   ```

---

## 7. File Summary

### New Files to Create:
| File | Purpose |
|---|---|
| `packages/db/src/schema/planning_sessions.ts` | Drizzle schema for planning_sessions table |
| `server/src/services/planning.ts` | Planning service (session lifecycle, Q&A) |
| `server/src/services/planning-utils.ts` | JSON extraction, prompt building, spec generation |
| `server/src/services/planning-llm.ts` | Lightweight LLM calls for planning |
| `server/src/routes/planning.ts` | Express routes for planning API |
| `web/src/components/PlanningPanel.tsx` | Main planning UI component |
| `web/src/components/QuestionCard.tsx` | Question display + option selection |
| `web/src/components/SpecPreview.tsx` | Spec review + approve UI |
| `web/src/components/ConversationHistory.tsx` | Past Q&A display |

### Files to Modify:
| File | Change |
|---|---|
| `packages/db/src/schema/issues.ts` | Add `planningSessionId`, `planningStatus` columns |
| `packages/db/src/schema/index.ts` | Export `planningSessions` |
| `server/src/routes/index.ts` | Mount planning routes |
| `server/src/services/heartbeat.ts` | Guard checkout during planning |
| Issue detail UI component | Add Planning tab/panel |

---

## 8. Implementation Order

1. **Phase 1: DB + Schema** — Create planning_sessions table, add issue columns, run migration
2. **Phase 2: Service Layer** — planning.ts, planning-utils.ts, planning-llm.ts
3. **Phase 3: API Routes** — planning.ts routes with auth/validation
4. **Phase 4: UI** — PlanningPanel + sub-components
5. **Phase 5: Integration** — Heartbeat guards, spec injection, auto-wakeup
6. **Phase 6: Polish** — Feature flag, activity logging, error handling, retry logic
