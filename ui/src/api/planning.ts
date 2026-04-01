import { api } from "./client";

export interface PlanningQuestion {
  id: string;
  text: string;
  options: { value: string; label: string }[];
}

export interface PlanningConversationEntry {
  role: "assistant" | "user";
  content: string;
  questionId?: string;
}

export interface PlanningState {
  active: boolean;
  status?: "asking" | "thinking" | "spec_ready" | "approved" | "cancelled" | "complete";
  conversation?: PlanningConversationEntry[];
  currentQuestion?: PlanningQuestion | null;
  spec?: string | null;
}

export const planningApi = {
  getState: (issueId: string) => api.get<PlanningState>(`/issues/${issueId}/planning`),
  start: (issueId: string, opts?: { model?: string }) =>
    api.post<PlanningState>(`/issues/${issueId}/planning`, opts ?? {}),
  poll: (issueId: string) => api.get<PlanningState>(`/issues/${issueId}/planning/poll`),
  submitAnswer: (issueId: string, questionId: string, answer: string) =>
    api.post<PlanningState>(`/issues/${issueId}/planning/answer`, { questionId, answer }),
  approve: (issueId: string) => api.post<PlanningState>(`/issues/${issueId}/planning/approve`, {}),
  cancel: (issueId: string) => api.delete<void>(`/issues/${issueId}/planning`),
};
