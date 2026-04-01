import { desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueActivities, issueDeliverables } from "@paperclipai/db";
import { publishLiveEvent } from "./live-events.js";

export type IssueActivityType =
  | "tool_call"
  | "code_change"
  | "file_created"
  | "test_run"
  | "research"
  | "decision"
  | "note";

export type IssueDeliverableType = "file" | "code" | "document" | "test" | "artifact";
export type IssueDeliverableStatus = "draft" | "final";

export function issueTransparencyService(db: Db) {
  return {
    logActivity: async (
      companyId: string,
      issueId: string,
      runId: string | null,
      agentId: string | null,
      type: IssueActivityType,
      summary: string,
      detail?: string | null,
      metadata?: Record<string, unknown> | null,
    ) => {
      const [activity] = await db
        .insert(issueActivities)
        .values({
          companyId,
          issueId,
          runId,
          agentId,
          type,
          summary,
          detail: detail ?? null,
          metadata: metadata ?? null,
        })
        .returning();

      publishLiveEvent({
        companyId,
        type: "issue.activity.logged",
        payload: { issueId, activity },
      });

      return activity;
    },

    listActivities: async (
      issueId: string,
      opts?: { limit?: number; offset?: number },
    ) => {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      return db
        .select()
        .from(issueActivities)
        .where(eq(issueActivities.issueId, issueId))
        .orderBy(desc(issueActivities.createdAt))
        .limit(limit)
        .offset(offset);
    },

    addDeliverable: async (
      companyId: string,
      issueId: string,
      runId: string | null,
      agentId: string | null,
      type: IssueDeliverableType,
      title: string,
      description: string,
      filePath?: string | null,
      content?: string | null,
      metadata?: Record<string, unknown> | null,
    ) => {
      const [deliverable] = await db
        .insert(issueDeliverables)
        .values({
          companyId,
          issueId,
          runId,
          agentId,
          type,
          title,
          description,
          filePath: filePath ?? null,
          content: content ?? null,
          metadata: metadata ?? null,
          status: "draft",
        })
        .returning();

      publishLiveEvent({
        companyId,
        type: "issue.deliverable.added",
        payload: { issueId, deliverable },
      });

      return deliverable;
    },

    listDeliverables: async (issueId: string) => {
      return db
        .select()
        .from(issueDeliverables)
        .where(eq(issueDeliverables.issueId, issueId))
        .orderBy(desc(issueDeliverables.createdAt));
    },

    updateDeliverable: async (
      deliverableId: string,
      updates: Partial<{
        title: string;
        description: string;
        filePath: string | null;
        content: string | null;
        metadata: Record<string, unknown> | null;
        status: IssueDeliverableStatus;
      }>,
    ) => {
      const [deliverable] = await db
        .update(issueDeliverables)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(issueDeliverables.id, deliverableId))
        .returning();

      if (deliverable) {
        publishLiveEvent({
          companyId: deliverable.companyId,
          type: "issue.deliverable.updated",
          payload: { issueId: deliverable.issueId, deliverable },
        });
      }

      return deliverable ?? null;
    },
  };
}
