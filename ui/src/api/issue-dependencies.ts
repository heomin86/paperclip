import { api } from "./client";

export interface IssueDependencyRef {
  dependencyId: string;
  issueId: string;
  identifier: string | null;
  title: string;
  status: string;
  createdAt: string;
}

export interface IssueDependencies {
  blockedBy: IssueDependencyRef[];
  blocks: IssueDependencyRef[];
  relatesTo: IssueDependencyRef[];
}

export interface DependencyReadyResult {
  ready: boolean;
  unmetCount: number;
  unmetIssues: { id: string; identifier: string | null; title: string; status: string }[];
}

export const issueDependenciesApi = {
  list: (issueId: string) =>
    api.get<IssueDependencies>(`/issues/${issueId}/dependencies`),

  add: (issueId: string, dependsOnIssueId: string, type: "blocks" | "relates_to" = "blocks") =>
    api.post<unknown>(`/issues/${issueId}/dependencies`, { dependsOnIssueId, type }),

  remove: (issueId: string, depId: string) =>
    api.delete<void>(`/issues/${issueId}/dependencies/${depId}`),

  checkReady: (issueId: string) =>
    api.get<DependencyReadyResult>(`/issues/${issueId}/dependencies/ready`),
};
