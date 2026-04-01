import { desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { subagentSessions } from "@paperclipai/db";
import { publishLiveEvent } from "./live-events.js";

export type SubAgentStatus = "spawned" | "running" | "completed" | "failed";

export function subagentTrackingService(db: Db) {
  return {
    registerSubAgent: async (
      companyId: string,
      parentRunId: string,
      parentAgentId: string,
      issueId: string | null,
      childAgentName: string,
      task: string,
    ) => {
      const [session] = await db
        .insert(subagentSessions)
        .values({
          companyId,
          parentRunId,
          parentAgentId,
          issueId,
          childAgentName,
          task,
          status: "spawned",
          startedAt: new Date(),
        })
        .returning();

      publishLiveEvent({
        companyId,
        type: "subagent.spawned",
        payload: { session },
      });

      return session;
    },

    updateSubAgentStatus: async (
      id: string,
      status: SubAgentStatus,
      result?: string | null,
      error?: string | null,
    ) => {
      const updates: Record<string, unknown> = { status };
      if (result !== undefined) updates.result = result;
      if (error !== undefined) updates.error = error;
      if (status === "completed" || status === "failed") {
        updates.completedAt = new Date();
      }

      const [session] = await db
        .update(subagentSessions)
        .set(updates)
        .where(eq(subagentSessions.id, id))
        .returning();

      if (session) {
        publishLiveEvent({
          companyId: session.companyId,
          type: "subagent.status_changed",
          payload: { session },
        });
      }

      return session ?? null;
    },

    completeSubAgent: async (id: string, result: string) => {
      const [session] = await db
        .update(subagentSessions)
        .set({ status: "completed", result, completedAt: new Date() })
        .where(eq(subagentSessions.id, id))
        .returning();

      if (session) {
        publishLiveEvent({
          companyId: session.companyId,
          type: "subagent.completed",
          payload: { session },
        });
      }

      return session ?? null;
    },

    failSubAgent: async (id: string, error: string) => {
      const [session] = await db
        .update(subagentSessions)
        .set({ status: "failed", error, completedAt: new Date() })
        .where(eq(subagentSessions.id, id))
        .returning();

      if (session) {
        publishLiveEvent({
          companyId: session.companyId,
          type: "subagent.failed",
          payload: { session },
        });
      }

      return session ?? null;
    },

    listByIssue: async (issueId: string) => {
      return db
        .select()
        .from(subagentSessions)
        .where(eq(subagentSessions.issueId, issueId))
        .orderBy(desc(subagentSessions.createdAt));
    },

    listByRun: async (parentRunId: string) => {
      return db
        .select()
        .from(subagentSessions)
        .where(eq(subagentSessions.parentRunId, parentRunId))
        .orderBy(desc(subagentSessions.createdAt));
    },

    getById: async (id: string) => {
      const [session] = await db
        .select()
        .from(subagentSessions)
        .where(eq(subagentSessions.id, id));
      return session ?? null;
    },
  };
}
