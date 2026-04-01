import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { subagentTrackingApi, type SubAgentSession, type SubAgentStatus } from "../api/subagent-tracking";

/* ---- Status helpers ---- */

const STATUS_ICONS: Record<SubAgentStatus, string> = {
  spawned: "🔵",
  running: "🟡",
  completed: "🟢",
  failed: "🔴",
};

const STATUS_LABELS: Record<SubAgentStatus, string> = {
  spawned: "Spawned",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/* ---- SubAgent Row ---- */

function SubAgentRow({ session }: { session: SubAgentSession }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-l-2 border-gray-300 dark:border-gray-600 ml-4 pl-3 py-1">
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 py-0.5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm" title={STATUS_LABELS[session.status as SubAgentStatus]}>
          {STATUS_ICONS[session.status as SubAgentStatus] ?? "⚪"}
        </span>
        <span className="font-medium text-sm truncate">{session.childAgentName}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto whitespace-nowrap">
          {formatDuration(session.startedAt, session.completedAt)}
        </span>
        <span className="text-xs text-gray-400">{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="ml-4 mt-1 space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <div>
            <span className="font-semibold">Task:</span> {session.task}
          </div>
          {session.childSessionId && (
            <div>
              <span className="font-semibold">Session ID:</span>{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{session.childSessionId}</code>
            </div>
          )}
          {session.result && (
            <div>
              <span className="font-semibold">Result:</span>
              <pre className="mt-0.5 p-1 bg-gray-50 dark:bg-gray-800 rounded text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                {session.result}
              </pre>
            </div>
          )}
          {session.error && (
            <div>
              <span className="font-semibold text-red-600">Error:</span>
              <pre className="mt-0.5 p-1 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap max-h-40 overflow-auto">
                {session.error}
              </pre>
            </div>
          )}
          <div className="text-gray-400">
            Status: {STATUS_LABELS[session.status as SubAgentStatus]}
            {session.startedAt && ` · Started: ${new Date(session.startedAt).toLocaleTimeString()}`}
            {session.completedAt && ` · Completed: ${new Date(session.completedAt).toLocaleTimeString()}`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Main Tree Component ---- */

interface SubAgentTreeProps {
  issueId?: string;
  runId?: string;
  parentAgentName?: string;
}

export function SubAgentTree({ issueId, runId, parentAgentName }: SubAgentTreeProps) {
  const issueQuery = useQuery({
    queryKey: issueId ? queryKeys.issues.subagents(issueId) : [],
    queryFn: () => subagentTrackingApi.listByIssue(issueId!),
    enabled: !!issueId && !runId,
  });

  const runQuery = useQuery({
    queryKey: runId ? queryKeys.runSubagents(runId) : [],
    queryFn: () => subagentTrackingApi.listByRun(runId!),
    enabled: !!runId,
  });

  const query = runId ? runQuery : issueQuery;
  const sessions = query.data?.items ?? [];

  if (query.isLoading) {
    return <div className="text-xs text-gray-400 py-2">Loading subagents...</div>;
  }

  if (sessions.length === 0) {
    return null;
  }

  const counts = {
    total: sessions.length,
    running: sessions.filter((s) => s.status === "running" || s.status === "spawned").length,
    completed: sessions.filter((s) => s.status === "completed").length,
    failed: sessions.filter((s) => s.status === "failed").length,
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        <span>🌳</span>
        <span>{parentAgentName ?? "Parent Agent"}</span>
        <span className="text-xs text-gray-400 font-normal">
          {counts.total} subagent{counts.total !== 1 ? "s" : ""}
          {counts.running > 0 && ` · ${counts.running} active`}
          {counts.failed > 0 && ` · ${counts.failed} failed`}
        </span>
      </div>
      <div className="space-y-0.5">
        {sessions.map((session) => (
          <SubAgentRow key={session.id} session={session} />
        ))}
      </div>
    </div>
  );
}
