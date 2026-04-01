import { api } from "./client";

/* ---- Types ---- */

export type SubAgentStatus = "spawned" | "running" | "completed" | "failed";

export interface SubAgentSession {
  id: string;
  companyId: string;
  parentRunId: string;
  parentAgentId: string;
  issueId: string | null;
  childAgentName: string;
  childSessionId: string | null;
  task: string;
  status: SubAgentStatus;
  result: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SubAgentListResponse {
  items: SubAgentSession[];
}

/* ---- API client ---- */

export const subagentTrackingApi = {
  listByIssue: (issueId: string) =>
    api.get<SubAgentListResponse>(`/issues/${issueId}/subagents`),

  listByRun: (runId: string) =>
    api.get<SubAgentListResponse>(`/heartbeat-runs/${runId}/subagents`),

  register: (
    issueId: string,
    body: {
      parentRunId: string;
      parentAgentId: string;
      childAgentName: string;
      childSessionId?: string;
      task: string;
    },
  ) => api.post<SubAgentSession>(`/issues/${issueId}/subagents`, body),

  updateStatus: (
    sessionId: string,
    body: Partial<{
      status: SubAgentStatus;
      childSessionId: string;
      result: string;
      error: string;
    }>,
  ) => api.patch<SubAgentSession>(`/subagent-sessions/${sessionId}`, body),
};
