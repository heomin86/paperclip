import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { issueService } from "../services/index.js";

/* ---- Validation schemas ---- */

const logActivitySchema = z.object({
  type: z.enum(["tool_call", "code_change", "file_read", "search", "shell", "thinking", "other"]),
  summary: z.string().min(1),
  detail: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addDeliverableSchema = z.object({
  type: z.enum(["code", "documentation", "test", "config", "artifact", "other"]),
  title: z.string().min(1),
  description: z.string().optional(),
  filePath: z.string().optional(),
  status: z.enum(["draft", "final"]).default("draft"),
  metadata: z.record(z.unknown()).optional(),
});

const updateDeliverableSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  filePath: z.string().optional(),
  status: z.enum(["draft", "final"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/* ---- In-memory stores (will be replaced by DB once schema is extended) ---- */

interface ActivityRecord {
  id: string;
  issueId: string;
  type: string;
  summary: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface DeliverableRecord {
  id: string;
  issueId: string;
  type: string;
  title: string;
  description?: string;
  filePath?: string;
  status: "draft" | "final";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const activitiesStore = new Map<string, ActivityRecord[]>();
const deliverablesStore = new Map<string, DeliverableRecord[]>();

let activitySeq = 0;
let deliverableSeq = 0;

function generateId(prefix: string, seq: number) {
  return `${prefix}_${Date.now()}_${seq}`;
}

/* ---- Route factory ---- */

export function issueTransparencyRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);

  /** Validate the issue exists and the caller has access, return the issue. */
  async function resolveIssue(issueId: string, req: Express.Request) {
    const issue = await issueSvc.getById(issueId);
    if (!issue) return null;
    assertCompanyAccess(req as Parameters<typeof assertCompanyAccess>[0], issue.companyId);
    return issue;
  }

  // ---- GET /issues/:issueId/activities – list activities (paginated) ----
  router.get("/issues/:issueId/activities", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const { limit, offset } = paginationSchema.parse(req.query);
    const all = activitiesStore.get(issue.id) ?? [];
    const items = all.slice(offset, offset + limit);
    res.json({ items, total: all.length, limit, offset });
  });

  // ---- POST /issues/:issueId/activities – log an activity ----
  router.post("/issues/:issueId/activities", validate(logActivitySchema), async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const id = generateId("act", ++activitySeq);
    const record: ActivityRecord = {
      id,
      issueId: issue.id,
      type: req.body.type,
      summary: req.body.summary,
      detail: req.body.detail,
      metadata: req.body.metadata,
      createdAt: new Date().toISOString(),
    };
    const list = activitiesStore.get(issue.id) ?? [];
    list.push(record);
    activitiesStore.set(issue.id, list);
    res.status(201).json(record);
  });

  // ---- GET /issues/:issueId/deliverables – list deliverables ----
  router.get("/issues/:issueId/deliverables", async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const items = deliverablesStore.get(issue.id) ?? [];
    res.json({ items });
  });

  // ---- POST /issues/:issueId/deliverables – add a deliverable ----
  router.post("/issues/:issueId/deliverables", validate(addDeliverableSchema), async (req, res) => {
    const issue = await resolveIssue(req.params.issueId as string, req);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const now = new Date().toISOString();
    const id = generateId("del", ++deliverableSeq);
    const record: DeliverableRecord = {
      id,
      issueId: issue.id,
      type: req.body.type,
      title: req.body.title,
      description: req.body.description,
      filePath: req.body.filePath,
      status: req.body.status ?? "draft",
      metadata: req.body.metadata,
      createdAt: now,
      updatedAt: now,
    };
    const list = deliverablesStore.get(issue.id) ?? [];
    list.push(record);
    deliverablesStore.set(issue.id, list);
    res.status(201).json(record);
  });

  // ---- PATCH /issues/:issueId/deliverables/:deliverableId – update deliverable ----
  router.patch(
    "/issues/:issueId/deliverables/:deliverableId",
    validate(updateDeliverableSchema),
    async (req, res) => {
      const issue = await resolveIssue(req.params.issueId as string, req);
      if (!issue) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }
      const list = deliverablesStore.get(issue.id) ?? [];
      const idx = list.findIndex((d) => d.id === req.params.deliverableId);
      if (idx === -1) {
        res.status(404).json({ error: "Deliverable not found" });
        return;
      }
      const updated: DeliverableRecord = {
        ...list[idx],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      list[idx] = updated;
      res.json(updated);
    },
  );

  return router;
}
