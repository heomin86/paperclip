import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { issueService } from "../services/index.js";
import { issueDependencyService } from "../services/issue-dependencies.js";

/* ---- Validation schemas ---- */

const addDependencySchema = z.object({
  dependsOnIssueId: z.string().uuid(),
  type: z.enum(["blocks", "relates_to"]).default("blocks"),
});

/* ---- Route factory ---- */

export function issueDependencyRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);
  const depSvc = issueDependencyService(db);

  /** Validate the issue exists and the caller has access, return the issue. */
  async function resolveIssue(issueId: string, req: Express.Request) {
    const issue = await issueSvc.getById(issueId);
    if (!issue) return null;
    assertCompanyAccess(req as Parameters<typeof assertCompanyAccess>[0], issue.companyId);
    return issue;
  }

  // ---- GET /issues/:issueId/dependencies – list all dependencies ----
  router.get("/issues/:issueId/dependencies", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const deps = await depSvc.getDependencies(issue.id);
    res.json(deps);
  });

  // ---- POST /issues/:issueId/dependencies – add a dependency ----
  router.post("/issues/:issueId/dependencies", validate(addDependencySchema), async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    try {
      const dep = await depSvc.addDependency(
        issue.companyId,
        issue.id,
        req.body.dependsOnIssueId,
        req.body.type,
      );
      res.status(201).json(dep);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err) {
        const httpErr = err as { statusCode: number; message: string };
        res.status(httpErr.statusCode).json({ error: httpErr.message });
        return;
      }
      throw err;
    }
  });

  // ---- DELETE /issues/:issueId/dependencies/:depId – remove a dependency ----
  router.delete("/issues/:issueId/dependencies/:depId", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    try {
      await depSvc.removeDependency(req.params.depId as string);
      res.status(204).end();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err) {
        const httpErr = err as { statusCode: number; message: string };
        res.status(httpErr.statusCode).json({ error: httpErr.message });
        return;
      }
      throw err;
    }
  });

  // ---- GET /issues/:issueId/dependencies/ready – check if ready to execute ----
  router.get("/issues/:issueId/dependencies/ready", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const result = await depSvc.checkDependenciesMet(issue.id);
    res.json(result);
  });

  return router;
}
