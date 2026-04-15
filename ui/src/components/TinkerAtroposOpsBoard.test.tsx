// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/router", () => ({
  Link: ({ children, className, to, ...props }: React.ComponentProps<"a"> & { to?: string }) => (
    <a className={className} href={to} {...props}>{children}</a>
  ),
}));

function buildQueryResults({
  issues,
  routines,
  commentBodies,
}: {
  issues?: Array<{ id: string; identifier?: string; title: string; status: string; priority?: string; updatedAt?: string }>;
  routines?: Array<{ id: string; title: string; status: string; lastRun?: { triggeredAt: string; status: string } }>;
  commentBodies?: Record<string, string>;
} = {}) {
  return {
    queries: [
      { data: issues ?? [
        { id: 'i1', identifier: 'TIN-7', title: 'Publish Ready Exporter Expansion', status: 'backlog', priority: 'medium', updatedAt: new Date().toISOString() },
        { id: 'i2', identifier: 'TIN-10', title: 'Dashboard V1 Build', status: 'backlog', priority: 'medium', updatedAt: new Date().toISOString() },
        { id: 'i3', identifier: 'TIN-1', title: 'Environment Status Monitor', status: 'done', priority: 'high', updatedAt: new Date().toISOString() },
      ] },
      { data: [
        { id: 'p1', name: 'System Inventory Board', status: 'in_progress' },
        { id: 'p2', name: 'Weekly Research Reporting', status: 'planned' },
      ] },
      { data: [
        { id: 'g1', title: '운영 가시성 확보', status: 'planned' },
      ] },
      { data: routines ?? [
        { id: 'r1', title: 'Daily Environment and Run Audit', status: 'active', lastRun: { triggeredAt: new Date().toISOString(), status: 'issue_created' } },
      ] },
      { data: [
        { id: 'a1', action: 'issue.updated', entityType: 'issue', entityId: 'i2', createdAt: new Date().toISOString() },
      ] },
      { data: [
        { id: 'ag1', name: 'Tinker Atropos Ops Coordinator', role: 'devops', status: 'idle', lastHeartbeatAt: new Date().toISOString() },
      ] },
    ],
    comments: Object.fromEntries(
      Object.entries(commentBodies ?? {}).map(([issueId, body]) => [issueId, [{ id: `${issueId}-c1`, body }]]),
    ),
  };
}

let queryResults = buildQueryResults();
let queryIndex = 0;

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryResults.queries[queryIndex++] ?? { data: [] },
  useQueries: ({ queries }: { queries: Array<{ queryKey: Array<string> }> }) =>
    queries.map((query) => ({ data: queryResults.comments[query.queryKey[1] ?? ""] ?? [] })),
}));

vi.mock("../api/activity", () => ({ activityApi: { list: vi.fn() } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: vi.fn() } }));
vi.mock("../api/goals", () => ({ goalsApi: { list: vi.fn() } }));
vi.mock("../api/issues", () => ({ issuesApi: { list: vi.fn() } }));
vi.mock("../api/projects", () => ({ projectsApi: { list: vi.fn() } }));
vi.mock("../api/routines", () => ({ routinesApi: { list: vi.fn() } }));
vi.mock("../lib/queryKeys", () => ({
  queryKeys: {
    issues: { list: () => ["issues"] },
    projects: { list: () => ["projects"] },
    goals: { list: () => ["goals"] },
    routines: { list: () => ["routines"] },
    activity: () => ["activity"],
    agents: { list: () => ["agents"] },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { TinkerAtroposOpsBoard } from "./TinkerAtroposOpsBoard";

describe("TinkerAtroposOpsBoard", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    queryIndex = 0;
    queryResults = buildQueryResults();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders the tinker ops board title and key operational sections", () => {
    const root = createRoot(container);

    act(() => {
      root.render(<TinkerAtroposOpsBoard companyId="company-1" />);
    });

    expect(container.textContent).toContain("Tinker Atropos Ops Board");
    expect(container.textContent).toContain("환경과 실행 상태");
    expect(container.textContent).toContain("패치 큐와 반영 채널");
    expect(container.textContent).toContain("승인 대기 패치, 동기화 검증 카드, 채널 반영 우선순위를 같이 본다.");
    expect(container.textContent).toContain("실시간 실행 신호");
    expect(container.textContent).toContain("프로젝트 진행 현황");
    expect(container.textContent).toContain("운영 목표 현황");
    expect(container.textContent).toContain("핵심 운영 카드");
    expect(container.textContent).toContain("활성 프로젝트");
    expect(container.textContent).toContain("활성 루틴");
    expect(container.textContent).toContain("운영 조정 담당");
    expect(container.textContent).toContain("운영 카드 전체 보기");
    expect(container.textContent).toContain("활동 로그 보기");
    expect(container.textContent).toContain("이슈 갱신");
    expect(container.textContent).toContain("이슈");
    expect(container.textContent).toContain("진행 중");
    expect(container.textContent).toContain("계획됨");
    expect(container.textContent).toContain("이슈 생성");
    expect(container.textContent).toContain("완료");

    const quickJumpLinks = Array.from(container.querySelectorAll('a')).filter((link) => link.textContent?.includes("바로 이동"));
    expect(quickJumpLinks.map((link) => ({
      text: link.textContent?.trim(),
      href: link.getAttribute("href"),
    }))).toEqual([
      { text: "환경 상태 바로 이동", href: "#environment-run-health" },
      { text: "패치 큐 바로 이동", href: "#patch-queue-export" },
      { text: "실시간 신호 바로 이동", href: "#tinker-live-signals" },
    ]);
    expect(container.querySelector('#environment-run-health')).not.toBeNull();
    expect(container.querySelector('#patch-queue-export')).not.toBeNull();
    expect(container.querySelector('#tinker-live-signals')).not.toBeNull();

    const headerCountLinks = Array.from(container.querySelectorAll('a')).filter((link) => ["이슈 3", "프로젝트 2", "루틴 1"].includes(link.textContent?.trim() ?? ""));
    expect(headerCountLinks.map((link) => ({
      text: link.textContent?.trim(),
      href: link.getAttribute("href"),
    }))).toEqual([
      { text: "이슈 3", href: "/issues" },
      { text: "프로젝트 2", href: "/projects" },
      { text: "루틴 1", href: "/routines" },
    ]);

    act(() => {
      root.unmount();
    });
  });

  it("replaces mixed English board copy with Korean interpretation labels", () => {
    const root = createRoot(container);

    act(() => {
      root.render(<TinkerAtroposOpsBoard companyId="company-1" />);
    });

    expect(container.textContent).not.toContain("Environment / Run Health");
    expect(container.textContent).not.toContain("Patch Queue + Export");
    expect(container.textContent).not.toContain("Live Signals");
    expect(container.textContent).not.toContain("Key Ops Cards");
    expect(container.textContent).not.toContain("활성 project");
    expect(container.textContent).not.toContain("활성 routine");
    expect(container.textContent).not.toContain("coordinator");
    expect(container.textContent).not.toContain("Issues 전체 보기");
    expect(container.textContent).not.toContain("Activity 보기");
    expect(container.textContent).not.toContain("issue.updated");
    expect(container.textContent).not.toContain("issue.comment_added");
    expect(container.textContent).not.toContain(" · issue");
    expect(container.textContent).not.toContain("in_progress");
    expect(container.textContent).not.toContain("planned");
    expect(container.textContent).not.toContain("completed");
    expect(container.textContent).not.toContain("done");
    expect(container.textContent).not.toContain("issue_created");

    act(() => {
      root.unmount();
    });
  });

  it("renders a warning banner when patch cards or routine issue signals need attention", () => {
    const root = createRoot(container);

    act(() => {
      root.render(<TinkerAtroposOpsBoard companyId="company-1" />);
    });

    expect(container.textContent).toContain("주의 필요");
    expect(container.textContent).toContain("열린 운영 카드 2건");
    expect(container.textContent).toContain("이슈 생성 신호 1건");
    expect(container.textContent).toContain("표시 기준: 열린 운영 카드 또는 이슈 생성 신호 발생");

    const alertLinks = Array.from(container.querySelectorAll("a")).filter((link) => ["운영 카드 보기", "루틴 실행 보기"].includes(link.textContent?.trim() ?? ""));
    expect(alertLinks.map((link) => ({
      text: link.textContent?.trim(),
      href: link.getAttribute("href"),
    }))).toEqual([
      { text: "운영 카드 보기", href: "/issues" },
      { text: "루틴 실행 보기", href: "/routines" },
    ]);

    act(() => {
      root.unmount();
    });
  });

  it("renders blocked and successful patch cards in separate groups", () => {
    queryResults = buildQueryResults({
      issues: [
        { id: 'i1', identifier: 'TIN-26', title: 'Patch Sync Verification 이차 승인 거부', status: 'blocked', priority: 'medium', updatedAt: new Date().toISOString() },
        { id: 'i2', identifier: 'TIN-27', title: 'Patch Sync Verification 이차 롤백', status: 'blocked', priority: 'high', updatedAt: new Date().toISOString() },
        { id: 'i3', identifier: 'TIN-28', title: 'Patch Sync Verification 이차 성공', status: 'done', priority: 'low', updatedAt: new Date().toISOString() },
      ],
      routines: [
        { id: 'r1', title: 'Daily Environment and Run Audit', status: 'active', lastRun: { triggeredAt: new Date().toISOString(), status: 'completed' } },
      ],
      commentBodies: {
        i1: '[막힘 · 보통] 승인 거부\n## 결과 요약',
        i2: '[막힘 · 높음] 롤백\n## 결과 요약',
        i3: '[완료 · 낮음] 성공\n## 결과 요약',
      },
    });
    const root = createRoot(container);

    act(() => {
      root.render(<TinkerAtroposOpsBoard companyId="company-1" />);
    });

    expect(container.textContent).toContain("막힘 카드");
    expect(container.textContent).toContain("최근 성공 카드");
    expect(container.textContent).toContain("Patch Sync Verification 이차 승인 거부");
    expect(container.textContent).toContain("Patch Sync Verification 이차 롤백");
    expect(container.textContent).toContain("Patch Sync Verification 이차 성공");
    expect(container.textContent).toContain("최근 코멘트: [막힘 · 보통] 승인 거부");
    expect(container.textContent).toContain("최근 코멘트: [막힘 · 높음] 롤백");
    expect(container.textContent).toContain("최근 코멘트: [완료 · 낮음] 성공");

    expect(container.querySelector('a[href="/issues/TIN-26"]')).not.toBeNull();
    expect(container.querySelector('a[href="/issues/TIN-27"]')).not.toBeNull();
    expect(container.querySelector('a[href="/issues/TIN-28"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders direct action buttons when the patch queue has no open issues", () => {
    queryResults = buildQueryResults({
      issues: [
        { id: 'i1', identifier: 'TIN-1', title: 'Environment Status Monitor', status: 'done', priority: 'high', updatedAt: new Date().toISOString() },
      ],
      routines: [
        { id: 'r1', title: 'Daily Environment and Run Audit', status: 'active', lastRun: { triggeredAt: new Date().toISOString(), status: 'completed' } },
      ],
    });
    const root = createRoot(container);

    act(() => {
      root.render(<TinkerAtroposOpsBoard companyId="company-1" />);
    });

    expect(container.textContent).toContain("지금 반영할 열린 patch 카드가 없다.");
    expect(container.textContent).toContain("새 feedback draft, sync 검증 카드, 운영 이슈가 생기면 여기에서 먼저 보인다.");
    expect(container.textContent).not.toContain("주의 필요");

    const links = Array.from(container.querySelectorAll("a"));
    const issuesLink = links.find((link) => link.textContent?.includes("Issues 보기"));
    const feedbackDraftLink = links.find((link) => link.textContent?.includes("feedback draft 확인"));

    expect(issuesLink?.getAttribute("href")).toBe("/issues");
    expect(feedbackDraftLink?.getAttribute("href")).toBe("/issues?q=feedback%20draft");

    act(() => {
      root.unmount();
    });
  });
});
