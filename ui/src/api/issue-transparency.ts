import { api } from "./client";

/* ---- Types ---- */

export type ActivityType =
  | "tool_call"
  | "code_change"
  | "file_read"
  | "search"
  | "shell"
  | "thinking"
  | "other";

export interface Activity {
  id: string;
  issueId: string;
  type: ActivityType;
  summary: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ActivitiesPage {
  items: Activity[];
  total: number;
  limit: number;
  offset: number;
}

export type DeliverableType =
  | "code"
  | "documentation"
  | "test"
  | "config"
  | "artifact"
  | "other";

export type DeliverableStatus = "draft" | "final";

export interface Deliverable {
  id: string;
  issueId: string;
  type: DeliverableType;
  title: string;
  description?: string;
  filePath?: string;
  status: DeliverableStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverablesResponse {
  items: Deliverable[];
}

/* ---- API client ---- */

export const issueTransparencyApi = {
  // Activities
  listActivities: (issueId: string, opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return api.get<ActivitiesPage>(`/issues/${issueId}/activities${qs ? `?${qs}` : ""}`);
  },

  logActivity: (
    issueId: string,
    body: { type: ActivityType; summary: string; detail?: string; metadata?: Record<string, unknown> },
  ) => api.post<Activity>(`/issues/${issueId}/activities`, body),

  // Deliverables
  listDeliverables: (issueId: string) =>
    api.get<DeliverablesResponse>(`/issues/${issueId}/deliverables`),

  addDeliverable: (
    issueId: string,
    body: {
      type: DeliverableType;
      title: string;
      description?: string;
      filePath?: string;
      status?: DeliverableStatus;
      metadata?: Record<string, unknown>;
    },
  ) => api.post<Deliverable>(`/issues/${issueId}/deliverables`, body),

  updateDeliverable: (
    issueId: string,
    deliverableId: string,
    body: Partial<{
      title: string;
      description: string;
      filePath: string;
      status: DeliverableStatus;
      metadata: Record<string, unknown>;
    }>,
  ) => api.patch<Deliverable>(`/issues/${issueId}/deliverables/${deliverableId}`, body),
};
