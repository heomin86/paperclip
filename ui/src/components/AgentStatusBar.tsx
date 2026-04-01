import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentUrl } from "../lib/utils";
import { Bot } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

type AgentVisualStatus = "running" | "idle" | "paused" | "error";

function deriveVisualStatus(agent: Agent): AgentVisualStatus {
  const s = agent.status;
  if (s === "running") return "running";
  if (s === "paused") return "paused";
  if (s === "error") return "error";
  return "idle";
}

const statusDot: Record<AgentVisualStatus, string> = {
  running: "bg-emerald-500",
  idle: "bg-muted-foreground/40",
  paused: "bg-amber-400",
  error: "bg-red-500",
};

const statusRing: Record<AgentVisualStatus, string> = {
  running: "ring-emerald-500/30",
  idle: "ring-transparent",
  paused: "ring-amber-400/25",
  error: "ring-red-500/25",
};

const statusLabel: Record<AgentVisualStatus, string> = {
  running: "Running",
  idle: "Idle",
  paused: "Paused",
  error: "Error",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentStatusBar() {
  const { selectedCompanyId } = useCompany();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, 50),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  // Map agentId -> current issue title (from live runs)
  const agentTaskMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of liveRuns ?? []) {
      if ((run.status === "running" || run.status === "queued") && run.agentId) {
        const existing = map.get(run.agentId);
        if (!existing) {
          map.set(run.agentId, run.triggerDetail ?? "Working…");
        }
      }
    }
    return map;
  }, [liveRuns]);

  const sorted = useMemo(() => {
    if (!agents) return [];
    const order: Record<AgentVisualStatus, number> = { running: 0, error: 1, paused: 2, idle: 3 };
    return [...agents].sort(
      (a, b) => order[deriveVisualStatus(a)] - order[deriveVisualStatus(b)],
    );
  }, [agents]);

  if (!selectedCompanyId || !agents || agents.length === 0) return null;

  const runningCount = sorted.filter((a) => deriveVisualStatus(a) === "running").length;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agent Status
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">{runningCount}</span>
            {" "}running
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">{agents.length}</span>
            {" "}total
          </span>
        </div>
      </div>

      {/* Agent chips */}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <TooltipProvider delayDuration={200}>
          {sorted.map((agent) => {
            const vs = deriveVisualStatus(agent);
            const taskTitle = agentTaskMap.get(agent.id);

            return (
              <Tooltip key={agent.id}>
                <TooltipTrigger asChild>
                  <Link
                    to={agentUrl(agent)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs no-underline text-inherit transition-colors",
                      "hover:bg-accent/50",
                      vs === "running"
                        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                        : vs === "error"
                          ? "border-red-500/20 bg-red-500/[0.04]"
                          : vs === "paused"
                            ? "border-amber-400/20 bg-amber-400/[0.04]"
                            : "border-border bg-background/50",
                    )}
                  >
                    {/* Status dot */}
                    <span className={cn("relative flex h-2 w-2 shrink-0")}>
                      {vs === "running" && (
                        <span
                          className={cn(
                            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                            statusDot[vs],
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          "relative inline-flex h-2 w-2 rounded-full ring-2",
                          statusDot[vs],
                          statusRing[vs],
                        )}
                      />
                    </span>

                    {/* Name */}
                    <span className="font-medium truncate max-w-[120px]">{agent.name}</span>

                    {/* Current task hint */}
                    {vs === "running" && taskTitle && (
                      <span className="hidden sm:inline truncate max-w-[160px] text-muted-foreground">
                        — {taskTitle}
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>

                <TooltipContent side="bottom" className="text-xs max-w-xs">
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-muted-foreground">
                    {statusLabel[vs]}
                    {taskTitle ? ` · ${taskTitle}` : ""}
                  </p>
                  {agent.title && (
                    <p className="mt-1 text-muted-foreground/70">{agent.title}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}
