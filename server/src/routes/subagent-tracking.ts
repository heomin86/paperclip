import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { issueService } from "../services/index.js";
import { subagentTrackingService } from "../services/subagent-tracking.js";

/* ---- Validation schemas ---- */

const registerSubAgentSchema = z.object({
  parentRunId: z.string().uuid(),
  parentAgentId: z.string().uuid(),
  childAgentName: z.string().min(1),
  childSessionId: z.string().optional(),
  task: z.string().min(1),
});

const updateSubAgentSchema = z.object({
  status: z.enum(["spawned", "running", "completed", "failed"]).optional(),
  childSessionId: z.string().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
});

/* ---- Route factory ---- */

export function subagentTrackingRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);
  const subagentSvc = subagentTrackingService(db);

  /** Validate the issue exists and the caller has access, return the issue. */
  async function resolveIssue(issueId: string, req: Express.Request) {
    const issue = await issueSvc.getById(issueId);
    if (!issue) return null;
    assertCompanyAccess(req as Parameters<typeof assertCompanyAccess>[0], issue.companyId);
    return issue;
  }

  // ---- GET /issues/:issueId/subagents – list subagents for an issue ----
  router.get("/issues/:issueId/subagents", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const items = await subagentSvc.listByIssue(issue.id);
    res.json({ items });
  });

  // ---- POST /issues/:issueId/subagents – register a subagent ----
  router.post("/issues/:issueId/subagents", validate(registerSubAgentSchema), async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const session = await subagentSvc.registerSubAgent(
      issue.companyId,
      req.body.parentRunId,
      req.body.parentAgentId,
      issue.id,
      req.body.childAgentName,
      req.body.task,
    );
    res.status(201).json(session);
  });

  // ---- PATCH /subagent-sessions/:id – update subagent status ----
  router.patch("/subagent-sessions/:id", validate(updateSubAgentSchema), async (req, res) => {
    const existing = await subagentSvc.getById(req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: "Subagent session not found" });
      return;
    }
    assertCompanyAccess(req as Parameters<typeof assertCompanyAccess>[0], existing.companyId);

    const { status, result, error } = req.body;

    let updated;
    if (status === "completed" && result) {
      updated = await subagentSvc.completeSubAgent(existing.id, result);
    } else if (status === "failed" && error) {
      updated = await subagentSvc.failSubAgent(existing.id, error);
    } else {
      updated = await subagentSvc.updateSubAgentStatus(
        existing.id,
        status ?? existing.status,
        result,
        error,
      );
    }

    res.json(updated);
  });

  // ---- GET /heartbeat-runs/:runId/subagents – list subagents for a run ----
  router.get("/heartbeat-runs/:runId/subagents", async (req, res) => {
    const items = await subagentSvc.listByRun(req.params.runId as string);
    res.json({ items });
  });

  return router;
}
