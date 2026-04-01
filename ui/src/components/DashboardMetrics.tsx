import { useEffect, useRef } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { DashboardSummary } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { dashboardApi } from "../api/dashboard";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  CircleDot,
  DollarSign,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Trend tracking – compare current values to previous snapshot
// ---------------------------------------------------------------------------

interface Snapshot {
  activeAgents: number;
  inProgress: number;
  completedToday: number;
  costCents: number;
  capturedAt: number;
}

type Trend = "up" | "down" | "flat";

function trend(current: number, previous: number): Trend {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function TrendIndicator({ t }: { t: Trend }) {
  if (t === "up")
    return <ArrowUp className="h-3 w-3 text-emerald-500" />;
  if (t === "down")
    return <ArrowDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground/50" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardMetrics() {
  const { selectedCompanyId } = useCompany();

  const { data } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  // Keep a previous snapshot for trend arrows
  const prevRef = useRef<Snapshot | null>(null);
  const currentRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    if (!data) return;
    const now: Snapshot = {
      activeAgents: data.agents.running,
      inProgress: data.tasks.inProgress,
      completedToday: data.tasks.done,
      costCents: data.costs.monthSpendCents,
      capturedAt: Date.now(),
    };
    if (currentRef.current) {
      prevRef.current = currentRef.current;
    }
    currentRef.current = now;
  }, [data]);

  if (!selectedCompanyId || !data) return null;

  const totalAgents = data.agents.active + data.agents.running + data.agents.paused + data.agents.error;
  const activeAgents = data.agents.running;
  const activePercent = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;

  const prev = prevRef.current;

  const cards: {
    key: string;
    icon: typeof Bot;
    value: string | number;
    label: string;
    description: string;
    trend: Trend;
    to: string;
    accentClass?: string;
  }[] = [
    {
      key: "active-agents",
      icon: Bot,
      value: activeAgents,
      label: "Active Agents",
      description: `${activePercent}% of ${totalAgents} agents`,
      trend: prev ? trend(activeAgents, prev.activeAgents) : "flat",
      to: "/agents",
      accentClass: activeAgents > 0 ? "text-cyan-500" : undefined,
    },
    {
      key: "in-progress",
      icon: CircleDot,
      value: data.tasks.inProgress,
      label: "In Progress",
      description: `${data.tasks.open} open, ${data.tasks.blocked} blocked`,
      trend: prev ? trend(data.tasks.inProgress, prev.inProgress) : "flat",
      to: "/issues",
    },
    {
      key: "completed",
      icon: CheckCircle2,
      value: data.tasks.done,
      label: "Completed",
      description: "All time",
      trend: prev ? trend(data.tasks.done, prev.completedToday) : "flat",
      to: "/issues",
      accentClass: data.tasks.done > 0 ? "text-emerald-500" : undefined,
    },
    {
      key: "cost",
      icon: DollarSign,
      value: formatCents(data.costs.monthSpendCents),
      label: "Month Spend",
      description: data.costs.monthBudgetCents > 0
        ? `${data.costs.monthUtilizationPercent}% of ${formatCents(data.costs.monthBudgetCents)}`
        : "Unlimited budget",
      trend: prev ? trend(data.costs.monthSpendCents, prev.costCents) : "flat",
      to: "/costs",
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-1 sm:gap-2">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.key}
            to={card.to}
            className="group no-underline text-inherit"
          >
            <div className="h-full rounded-lg px-4 py-4 sm:px-5 sm:py-5 transition-colors hover:bg-accent/50 cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums",
                      card.accentClass,
                    )}>
                      {card.value}
                    </p>
                    <TrendIndicator t={card.trend} />
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                    {card.label}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1.5 hidden sm:block">
                    {card.description}
                  </p>
                </div>
                <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1.5" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
