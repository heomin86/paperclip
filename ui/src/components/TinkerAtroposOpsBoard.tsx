import { Link } from "@/lib/router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { routinesApi } from "../api/routines";
import { queryKeys } from "../lib/queryKeys";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { shouldShowTinkerAttention, TINKER_ATTENTION_CRITERIA } from "./dashboardAlertRules";
import { ActivitySquare, Bot, ClipboardList, FolderKanban, Goal, Radar, Sparkles, Workflow } from "lucide-react";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background/40 px-3 py-2">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function priorityWeight(priority: string | null | undefined) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function priorityLabel(priority: string | null | undefined) {
  if (priority === "critical") return "긴급";
  if (priority === "high") return "높음";
  if (priority === "medium") return "보통";
  if (priority === "low") return "낮음";
  return priority ?? "미정";
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "issue_created":
      return "이슈 생성";
    case "completed":
    case "succeeded":
    case "done":
      return "완료";
    case "in_progress":
      return "진행 중";
    case "planned":
      return "계획됨";
    case "active":
      return "활성";
    case "backlog":
      return "대기열";
    case "todo":
      return "할 일";
    case "blocked":
      return "막힘";
    case "running":
      return "실행 중";
    case "queued":
      return "대기 중";
    case "failed":
      return "실패";
    case "timed_out":
      return "시간 초과";
    case "cancelled":
      return "취소됨";
    case "archived":
      return "보관됨";
    default:
      return status ?? "미상";
  }
}

function activityActionLabel(action: string | null | undefined) {
  switch (action) {
    case "issue.updated":
      return "이슈 갱신";
    case "issue.comment_added":
      return "이슈 댓글 추가";
    case "heartbeat.failed":
      return "허트비트 실패";
    case "heartbeat.succeeded":
      return "허트비트 성공";
    default:
      return action ?? "활동";
  }
}

function entityTypeLabel(entityType: string | null | undefined) {
  switch (entityType) {
    case "issue":
      return "이슈";
    case "heartbeat_run":
      return "허트비트 실행";
    case "routine":
      return "루틴";
    default:
      return entityType ?? "항목";
  }
}

function commentSummaryLine(body: string | null | undefined) {
  if (!body) return null;
  return body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

export function TinkerAtroposOpsBoard({ companyId }: { companyId: string }) {
  const { data: issues = [] } = useQuery({ queryKey: queryKeys.issues.list(companyId), queryFn: () => issuesApi.list(companyId), enabled: !!companyId });
  const { data: projects = [] } = useQuery({ queryKey: queryKeys.projects.list(companyId), queryFn: () => projectsApi.list(companyId), enabled: !!companyId });
  const { data: goals = [] } = useQuery({ queryKey: queryKeys.goals.list(companyId), queryFn: () => goalsApi.list(companyId), enabled: !!companyId });
  const { data: routines = [] } = useQuery({ queryKey: queryKeys.routines.list(companyId), queryFn: () => routinesApi.list(companyId), enabled: !!companyId });
  const { data: activity = [] } = useQuery({ queryKey: queryKeys.activity(companyId), queryFn: () => activityApi.list(companyId), enabled: !!companyId });
  const { data: agents = [] } = useQuery({ queryKey: queryKeys.agents.list(companyId), queryFn: () => agentsApi.list(companyId), enabled: !!companyId });

  const openIssues = issues
    .filter((issue) => issue.status !== "done" && issue.status !== "cancelled")
    .sort((a, b) => {
      const delta = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (delta !== 0) return delta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const patchSignalCards = issues.filter((issue) => /Patch Sync Verification|Review Queue|Tracker/i.test(issue.title));
  const blockedPatchCards = patchSignalCards
    .filter((issue) => issue.status !== "done" && issue.status !== "cancelled")
    .sort((a, b) => {
      const delta = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (delta !== 0) return delta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const successfulPatchCards = patchSignalCards
    .filter((issue) => issue.status === "done")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const monitorCards = issues.filter((issue) => /Monitor|Scoreboard|Review Queue|Tracker/i.test(issue.title));
  const latestSignals = activity.slice(0, 6);
  const latestRoutineRuns = routines.filter((routine) => routine.lastRun).slice(0, 4);
  const blockedPatchCardsToShow = blockedPatchCards.slice(0, 4);
  const successfulPatchCardsToShow = successfulPatchCards.slice(0, 3);
  const visiblePatchCards = [...blockedPatchCardsToShow, ...successfulPatchCardsToShow];
  const patchCommentQueries = useQueries({
    queries: visiblePatchCards.map((issue) => ({
      queryKey: ["issue-comments", issue.id],
      queryFn: () => issuesApi.listComments(issue.id),
      enabled: !!companyId,
    })),
  });
  const latestPatchCommentByIssueId = new Map(
    visiblePatchCards.map((issue, index) => [
      issue.id,
      commentSummaryLine(patchCommentQueries[index]?.data?.[0]?.body),
    ]),
  );
  const routineIssueSignals = latestRoutineRuns.filter((routine) => !["completed", "succeeded"].includes(routine.lastRun?.status ?? "unknown")).length;
  const activeProjects = projects.filter((project) => project.status === "in_progress").length;
  const activeRoutines = routines.filter((routine) => routine.status === "active").length;
  const coordinator = agents.find((agent) => /Coordinator/.test(agent.name)) ?? agents[0];
  const quickJumpLinks = [
    { label: "환경 상태 바로 이동", href: "#environment-run-health" },
    { label: "패치 큐 바로 이동", href: "#patch-queue-export" },
    { label: "실시간 신호 바로 이동", href: "#tinker-live-signals" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tinker Atropos Ops Board</h3>
          <p className="text-sm text-muted-foreground">환경 상태, 풀 퍼널 실행, 패치 승인 결과를 한 화면에서 보는 전용 관제 블록.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickJumpLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/issues" className="transition-opacity hover:opacity-90">
            <Badge variant="secondary">이슈 {issues.length}</Badge>
          </Link>
          <Link to="/projects" className="transition-opacity hover:opacity-90">
            <Badge variant="secondary">프로젝트 {projects.length}</Badge>
          </Link>
          <Link to="/routines" className="transition-opacity hover:opacity-90">
            <Badge variant="secondary">루틴 {routines.length}</Badge>
          </Link>
        </div>
      </div>

      {shouldShowTinkerAttention({ openIssues: openIssues.length, routineIssueSignals }) && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                <ActivitySquare className="h-4 w-4" /> 주의 필요
              </div>
              <p className="text-sm text-amber-100/90">
                열린 운영 카드 {openIssues.length}건 · 이슈 생성 신호 {routineIssueSignals}건
              </p>
              <p className="text-xs text-amber-100/70">
                {TINKER_ATTENTION_CRITERIA}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-medium">
              <Link to="/issues" className="text-amber-100 underline underline-offset-2">운영 카드 보기</Link>
              <Link to="/routines" className="text-amber-100 underline underline-offset-2">루틴 실행 보기</Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card id="environment-run-health">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Radar className="h-4 w-4" /> 환경과 실행 상태</CardTitle>
            <CardDescription>환경 파일, 실행 루틴, 산출물 누락 신호를 먼저 본다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Stat label="열린 운영 카드" value={openIssues.length} />
            <Stat label="활성 프로젝트" value={activeProjects} />
            <Stat label="활성 루틴" value={activeRoutines} />
            <Stat label="운영 조정 담당" value={coordinator?.name ?? "없음"} />
          </CardContent>
        </Card>

        <Card id="patch-queue-export">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" /> 패치 큐와 반영 채널</CardTitle>
            <CardDescription>승인 대기 패치, 동기화 검증 카드, 채널 반영 우선순위를 같이 본다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blockedPatchCards.length === 0 && successfulPatchCards.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm">
                <div className="font-medium text-foreground">지금 반영할 열린 patch 카드가 없다.</div>
                <div className="mt-1 text-xs text-muted-foreground">새 feedback draft, sync 검증 카드, 운영 이슈가 생기면 여기에서 먼저 보인다.</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/issues">Issues 보기</Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/issues?q=feedback%20draft">feedback draft 확인</Link>
                  </Button>
                </div>
              </div>
            ) : null}
            {blockedPatchCards.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">막힘 카드</div>
                {blockedPatchCardsToShow.map((issue) => (
                  <Link key={issue.id} to={`/issues/${issue.identifier ?? issue.id}`} className="block rounded-md border px-3 py-3 transition-colors hover:bg-accent/20">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{issue.identifier ?? issue.id}</div>
                        <div className="text-xs text-muted-foreground">{issue.title}</div>
                        {latestPatchCommentByIssueId.get(issue.id) ? (
                          <div className="mt-2 text-xs text-muted-foreground">최근 코멘트: {latestPatchCommentByIssueId.get(issue.id)}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline">{priorityLabel(issue.priority)}</Badge>
                        <Badge variant="secondary">{statusLabel(issue.status)}</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
            {successfulPatchCards.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">최근 성공 카드</div>
                {successfulPatchCardsToShow.map((issue) => (
                  <Link key={issue.id} to={`/issues/${issue.identifier ?? issue.id}`} className="block rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 transition-colors hover:bg-emerald-500/10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{issue.identifier ?? issue.id}</div>
                        <div className="text-xs text-muted-foreground">{issue.title}</div>
                        {latestPatchCommentByIssueId.get(issue.id) ? (
                          <div className="mt-2 text-xs text-muted-foreground">최근 코멘트: {latestPatchCommentByIssueId.get(issue.id)}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline">{priorityLabel(issue.priority)}</Badge>
                        <Badge variant="secondary">{statusLabel(issue.status)}</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
            <Link to="/issues" className="text-xs text-primary underline underline-offset-2">운영 카드 전체 보기</Link>
          </CardContent>
        </Card>

        <Card id="tinker-live-signals">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ActivitySquare className="h-4 w-4" /> 실시간 실행 신호</CardTitle>
            <CardDescription>최근 루틴 실행과 활동 로그를 실시간 신호처럼 읽는다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestRoutineRuns.map((routine) => (
              <div key={routine.id} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{routine.title}</span>
                  <Badge variant="outline">{statusLabel(routine.lastRun?.status)}</Badge>
                </div>
              </div>
            ))}
            {latestSignals.map((event) => (
              <div key={event.id} className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                {activityActionLabel(event.action)} · {entityTypeLabel(event.entityType)}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FolderKanban className="h-4 w-4" /> 프로젝트 진행 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {projects.slice(0, 5).map((project) => (
              <div key={project.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>{project.name}</span>
                <Badge variant="outline">{statusLabel(project.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Goal className="h-4 w-4" /> 운영 목표 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {goals.slice(0, 5).map((goal) => (
              <div key={goal.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>{goal.title}</span>
                <Badge variant="outline">{statusLabel(goal.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> 핵심 운영 카드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {monitorCards.slice(0, 6).map((issue) => (
              <div key={issue.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span>{issue.title}</span>
                <Badge variant="outline">{statusLabel(issue.status)}</Badge>
              </div>
            ))}
            <Link to="/activity" className="text-xs text-primary underline underline-offset-2">활동 로그 보기</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
