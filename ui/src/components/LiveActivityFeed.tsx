import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Agent, LiveEvent } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  Loader2,
  Package,
  Play,
  RotateCcw,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedEvent {
  /** Unique key for React rendering */
  key: string;
  type: LiveEvent["type"];
  action: string | null;
  agentName: string | null;
  agentId: string | null;
  message: string;
  issueRef: string | null;
  issueHref: string | null;
  timestamp: string;
  raw: LiveEvent;
}

type FeedFilter = "all" | "heartbeats" | "agents" | "issues";

const MAX_FEED_EVENTS = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
}

function eventIcon(type: string, action: string | null) {
  if (type === "heartbeat.run.queued") return <Play className="h-3.5 w-3.5 text-cyan-500" />;
  if (type === "heartbeat.run.status") {
    if (action === "succeeded" || action === "completed")
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (action === "failed" || action === "timed_out" || action === "cancelled")
      return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    return <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin" />;
  }
  if (type === "agent.status") return <Bot className="h-3.5 w-3.5 text-violet-400" />;
  if (type === "activity.logged") {
    if (action?.startsWith("issue.")) return <CircleDot className="h-3.5 w-3.5 text-amber-400" />;
    if (action?.startsWith("agent.")) return <Bot className="h-3.5 w-3.5 text-violet-400" />;
    if (action?.startsWith("approval.")) return <FileText className="h-3.5 w-3.5 text-orange-400" />;
    return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  if (type === "issue.activity.logged") return <Activity className="h-3.5 w-3.5 text-amber-400" />;
  if (type === "issue.deliverable.added" || type === "issue.deliverable.updated")
    return <Package className="h-3.5 w-3.5 text-emerald-400" />;
  if (type === "heartbeat.run.event") return <Zap className="h-3.5 w-3.5 text-cyan-300" />;
  return <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />;
}

function eventBorderColor(type: string, action: string | null): string {
  if (type === "heartbeat.run.queued") return "border-l-cyan-500/60";
  if (type === "heartbeat.run.status") {
    if (action === "succeeded" || action === "completed") return "border-l-emerald-500/60";
    if (action === "failed" || action === "timed_out" || action === "cancelled") return "border-l-red-400/60";
    return "border-l-cyan-400/60";
  }
  if (type === "agent.status") return "border-l-violet-400/60";
  if (type === "activity.logged" || type === "issue.activity.logged") return "border-l-amber-400/60";
  if (type.startsWith("issue.deliverable")) return "border-l-emerald-400/60";
  return "border-l-border";
}

function matchesFilter(ev: FeedEvent, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  if (filter === "heartbeats") return ev.type.startsWith("heartbeat.");
  if (filter === "agents") return ev.type === "agent.status" || ev.raw.payload?.entityType === "agent";
  if (filter === "issues")
    return (
      ev.type.startsWith("issue.") ||
      (ev.type === "activity.logged" && ev.raw.payload?.entityType === "issue")
    );
  return true;
}

// ---------------------------------------------------------------------------
// WebSocket hook – connects to the same endpoint as LiveUpdatesProvider
// ---------------------------------------------------------------------------

function useLiveEventStream(companyId: string | null): LiveEvent[] {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!companyId) return;

    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        if (closed || socket !== ws) { ws.close(1000, "stale"); return; }
        reconnectAttempt = 0;
      };

      ws.onmessage = (msg) => {
        const raw = typeof msg.data === "string" ? msg.data : "";
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as LiveEvent;
          if (parsed.companyId !== companyId) return;
          // Skip noisy log events
          if (parsed.type === "heartbeat.run.log") return;
          setEvents((prev) => {
            const next = [...prev, parsed];
            return next.length > MAX_FEED_EVENTS ? next.slice(-MAX_FEED_EVENTS) : next;
          });
        } catch { /* ignore non-JSON */ }
      };

      ws.onerror = () => { /* onclose handles reconnect */ };
      ws.onclose = () => {
        if (socket !== ws || closed) return;
        socket = null;
        reconnectAttempt += 1;
        const delay = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 4));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    const startTimer = window.setTimeout(connect, 0);

    return () => {
      closed = true;
      window.clearTimeout(startTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === 1) socket.close(1000, "unmount");
      }
    };
  }, [companyId]);

  // Reset on company change
  useEffect(() => {
    setEvents([]);
    seqRef.current = 0;
  }, [companyId]);

  return events;
}

// ---------------------------------------------------------------------------
// Derive display-friendly FeedEvent from raw LiveEvent
// ---------------------------------------------------------------------------

function deriveFeedEvent(
  raw: LiveEvent,
  agentMap: Map<string, Agent>,
  seq: number,
): FeedEvent {
  const p = raw.payload ?? {};
  const agentId = readString(p.agentId) ?? readString(p.actorId);
  const agentName = agentId ? agentMap.get(agentId)?.name ?? null : null;

  const issueId = readString(p.entityType) === "issue" ? readString(p.entityId) : readString(p.issueId);
  const issueIdentifier = readString(p.identifier) ?? readString(p.issueIdentifier);
  const issueRef = issueIdentifier ?? (issueId ? issueId.slice(0, 8) : null);
  const issueHref = issueId ? `/issues/${issueIdentifier ?? issueId}` : null;

  let action = readString(p.status) ?? readString(p.action);
  let message = "";

  switch (raw.type) {
    case "heartbeat.run.queued":
      message = `Heartbeat queued${issueRef ? ` for ${issueRef}` : ""}`;
      break;
    case "heartbeat.run.status": {
      const status = readString(p.status) ?? "updated";
      message = `Run ${status.replace(/_/g, " ")}${issueRef ? ` on ${issueRef}` : ""}`;
      break;
    }
    case "heartbeat.run.event":
      message = readString(p.message) ?? `Run event${issueRef ? ` on ${issueRef}` : ""}`;
      break;
    case "agent.status": {
      const status = readString(p.status) ?? "updated";
      message = `Agent status → ${status}`;
      action = status;
      break;
    }
    case "activity.logged": {
      const act = readString(p.action) ?? "activity";
      const entityName = readString(p.entityName);
      const verb = act.replace(/[._]/g, " ");
      message = entityName ? `${verb} ${entityName}` : verb;
      action = act;
      break;
    }
    case "issue.activity.logged":
      message = readString(p.action)?.replace(/[._]/g, " ") ?? "Issue activity";
      break;
    case "issue.deliverable.added":
      message = `Deliverable added${issueRef ? ` to ${issueRef}` : ""}`;
      break;
    case "issue.deliverable.updated":
      message = `Deliverable updated${issueRef ? ` on ${issueRef}` : ""}`;
      break;
    default:
      message = raw.type.replace(/[._]/g, " ");
  }

  return {
    key: `${raw.id}-${seq}`,
    type: raw.type,
    action,
    agentName,
    agentId,
    message: truncate(message, 120),
    issueRef,
    issueHref,
    timestamp: raw.createdAt,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveActivityFeed() {
  const { selectedCompanyId } = useCompany();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const seqRef = useRef(0);

  const rawEvents = useLiveEventStream(selectedCompanyId ?? null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useRef(new Map<string, Agent>());
  useEffect(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    agentMap.current = map;
  }, [agents]);

  const feedEvents: FeedEvent[] = rawEvents.map((raw) => {
    seqRef.current += 1;
    return deriveFeedEvent(raw, agentMap.current, seqRef.current);
  });

  const filtered = feedEvents.filter((ev) => matchesFilter(ev, filter));

  // Auto-scroll logic
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledRef.current = !atBottom;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  const filters: { key: FeedFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "heartbeats", label: "Runs" },
    { key: "agents", label: "Agents" },
    { key: "issues", label: "Issues" },
  ];

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live Feed
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
            {filtered.length}
          </span>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-border/50"
        style={{ maxHeight: 420 }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="h-5 w-5 mb-2 opacity-40" />
            <p className="text-sm">Waiting for live events…</p>
          </div>
        ) : (
          filtered.map((ev) => <FeedEventRow key={ev.key} event={ev} />)
        )}
      </div>

      {/* Scroll-to-bottom hint */}
      {userScrolledRef.current && filtered.length > 0 && (
        <button
          className="border-t border-border bg-muted/50 px-4 py-1.5 text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            userScrolledRef.current = false;
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
        >
          ↓ Scroll to latest
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function FeedEventRow({ event }: { event: FeedEvent }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-4 py-2.5 text-sm border-l-2 transition-colors hover:bg-accent/30 animate-in fade-in slide-in-from-bottom-1 duration-300",
        eventBorderColor(event.type, event.action),
      )}
    >
      <span className="mt-0.5 shrink-0">{eventIcon(event.type, event.action)}</span>

      <div className="flex-1 min-w-0">
        <p className="truncate">
          {event.agentName && (
            <span className="font-medium text-foreground">{event.agentName}</span>
          )}
          {event.agentName && <span className="text-muted-foreground mx-1">·</span>}
          <span className="text-muted-foreground">{event.message}</span>
        </p>

        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {relativeTime(event.timestamp)}
          </span>
          {event.issueRef && event.issueHref && (
            <Link
              to={event.issueHref}
              className="font-mono text-primary/80 hover:text-primary hover:underline no-underline"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {event.issueRef}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
