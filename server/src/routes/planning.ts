import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { issueService } from "../services/index.js";

const answerSchema = z.object({
  questionId: z.string(),
  answer: z.string(),
});

const startPlanningSchema = z.object({
  /** Optional override for the LLM model to use during planning. */
  model: z.string().optional(),
});

export function planningRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);

  // Lazily import the planning service so the module isn't required at boot
  // when it hasn't been created yet. The service file lives at
  // server/src/services/planning.ts and is expected to export a
  // `planningService(db)` factory that returns the service singleton.
  let _planningSvc: ReturnType<typeof getPlanningService> | null = null;
  function getPlanningService() {
    // Dynamic import would be cleaner but we keep it synchronous to match
    // the rest of the codebase which uses require-style lazy singletons.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../services/planning.js") as {
      planningService: (db: Db) => PlanningServiceHandle;
    };
    return mod.planningService(db);
  }
  function svc() {
    if (!_planningSvc) _planningSvc = getPlanningService();
    return _planningSvc;
  }

  /** Validate the issue exists and the caller has access, return the issue. */
  async function resolveIssue(issueId: string, req: Express.Request) {
    const issue = await issueSvc.getById(issueId);
    if (!issue) return null;
    assertCompanyAccess(req as Parameters<typeof assertCompanyAccess>[0], issue.companyId);
    return issue;
  }

  // ---- GET /issues/:issueId/planning – current planning state ----------
  router.get("/issues/:issueId/planning", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const state = await svc().getState(issue.id);
    if (!state) {
      res.json({ active: false });
      return;
    }
    res.json({ active: true, ...state });
  });

  // ---- POST /issues/:issueId/planning – start a planning session ------
  router.post("/issues/:issueId/planning", validate(startPlanningSchema), async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const existing = await svc().getState(issue.id);
    if (existing && existing.status !== "cancelled" && existing.status !== "complete") {
      res.status(409).json({ error: "Planning session already active" });
      return;
    }
    const state = await svc().start(issue.id, req.body);
    res.status(201).json(state);
  });

  // ---- GET /issues/:issueId/planning/poll – poll for updates -----------
  router.get("/issues/:issueId/planning/poll", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const state = await svc().getState(issue.id);
    if (!state) {
      res.json({ active: false });
      return;
    }
    res.json({ active: true, ...state });
  });

  // ---- POST /issues/:issueId/planning/answer – submit an answer -------
  router.post("/issues/:issueId/planning/answer", validate(answerSchema), async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const state = await svc().submitAnswer(issue.id, req.body.questionId, req.body.answer);
    if (!state) {
      res.status(404).json({ error: "No active planning session" });
      return;
    }
    res.json(state);
  });

  // ---- POST /issues/:issueId/planning/approve – approve spec ----------
  router.post("/issues/:issueId/planning/approve", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const result = await svc().approve(issue.id);
    if (!result) {
      res.status(404).json({ error: "No active planning session" });
      return;
    }
    res.json(result);
  });

  // ---- DELETE /issues/:issueId/planning – cancel planning session ------
  router.delete("/issues/:issueId/planning", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await svc().cancel(issue.id);
    res.status(204).end();
  });

  return router;
}

/* ---- Type describing the planning service handle ---- */

interface PlanningQuestion {
  id: string;
  text: string;
  options: { value: string; label: string }[];
}

interface PlanningConversationEntry {
  role: "assistant" | "user";
  content: string;
  questionId?: string;
}

interface PlanningState {
  status: "asking" | "thinking" | "spec_ready" | "approved" | "cancelled" | "complete";
  conversation: PlanningConversationEntry[];
  currentQuestion: PlanningQuestion | null;
  spec: string | null;
}

interface PlanningServiceHandle {
  getState(issueId: string): Promise<PlanningState | null>;
  start(issueId: string, opts?: { model?: string }): Promise<PlanningState>;
  submitAnswer(issueId: string, questionId: string, answer: string): Promise<PlanningState | null>;
  approve(issueId: string): Promise<PlanningState | null>;
  cancel(issueId: string): Promise<void>;
}
