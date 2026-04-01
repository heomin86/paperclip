import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { issueTransparencyApi, type Activity, type ActivityType } from "../api/issue-transparency";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity as ActivityIcon,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  FileSearch,
  Loader2,
  Search,
  Terminal,
  Brain,
  Circle,
} from "lucide-react";

/* ---- Props ---- */

interface ActivityFeedProps {
  issueId: string;
}

/* ---- Activity type config ---- */

const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  { icon: React.ElementType; label: string; color: string }
> = {
  tool_call: { icon: Terminal, label: "Tool Call", color: "text-blue-500" },
  code_change: { icon: Code2, label: "Code Change", color: "text-green-500" },
  file_read: { icon: Eye, label: "File Read", color: "text-amber-500" },
  search: { icon: Search, label: "Search", color: "text-purple-500" },
  shell: { icon: Terminal, label: "Shell", color: "text-orange-500" },
  thinking: { icon: Brain, label: "Thinking", color: "text-cyan-500" },
  other: { icon: Circle, label: "Other", color: "text-muted-foreground" },
};

/* ---- Helpers ---- */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

/* ---- Expandable activity item ---- */

function ActivityItem({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const config = ACTIVITY_TYPE_CONFIG[activity.type] ?? ACTIVITY_TYPE_CONFIG.other;
  const Icon = config.icon;
  const hasDetail = !!activity.detail;

  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background",
            config.color,
          )}
        >
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 w-px bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 text-sm font-medium text-foreground text-left",
              hasDetail && "cursor-pointer hover:text-primary",
            )}
            onClick={() => hasDetail && setExpanded(!expanded)}
            disabled={!hasDetail}
          >
            {hasDetail && (
              expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              )
            )}
            {activity.summary}
          </button>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {relativeTime(activity.createdAt)}
          </span>
        </div>

        <span className={cn("text-xs", config.color)}>{config.label}</span>

        {expanded && activity.detail && (
          <div className="mt-2 rounded-md border bg-muted/30 p-2.5 text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">
            {activity.detail}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Main component ---- */

const PAGE_SIZE = 30;

export function ActivityFeed({ issueId }: ActivityFeedProps) {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.issues.transparencyActivities(issueId, page),
    queryFn: () =>
      issueTransparencyApi.listActivities(issueId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: 5000,
  });

  const activities = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasMore = (page + 1) * PAGE_SIZE < total;

  if (isLoading) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0 && page === 0) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ActivityIcon className="h-4 w-4" />
            Activity Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No activities recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ActivityIcon className="h-4 w-4" />
          Activity Feed
          {total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({total})</span>
          )}
        </CardTitle>
      </CardHeader>
      <ScrollArea className="max-h-96">
        <CardContent className="pt-0">
          {activities.map((act) => (
            <ActivityItem key={act.id} activity={act} />
          ))}
        </CardContent>
      </ScrollArea>
      {(hasMore || page > 0) && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}
