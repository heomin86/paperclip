# 2026-04-14 Paperclip commit slices

현재 작업 트리를 한 번에 커밋하지 않고 아래 순서로 자르는 것이 가장 안전하다.

## 1. 대시보드 전용 관제 보드 추가

목표:
- 회사별 전용 관제 블록을 Dashboard 에 연결
- 빈 patch queue 상태에서 바로 행동 가능한 버튼 제공

파일:
- `ui/src/pages/Dashboard.tsx`
- `ui/src/components/GraphRAGOpsBoard.tsx`
- `ui/src/components/MarketingCreativeOpsBoard.tsx`
- `ui/src/components/MissionControlCompanyBoard.tsx`
- `ui/src/components/MissionControlCompanyBoard.test.tsx`
- `ui/src/components/TinkerAtroposOpsBoard.tsx`
- `ui/src/components/TinkerAtroposOpsBoard.test.tsx`

메시지 초안:
- `feat(ui): add company-specific ops boards to dashboard`

검증:
- `pnpm vitest run ui/src/components/MissionControlCompanyBoard.test.tsx ui/src/components/TinkerAtroposOpsBoard.test.tsx`
- `pnpm --filter @paperclipai/ui typecheck`

메모:
- `TinkerAtroposOpsBoard` 빈 상태에는 `Issues 보기`, `feedback draft 확인` 직접 행동 버튼이 들어가야 한다.

## 2. 에이전트 런타임 / Hermes 로컬 래퍼 / heartbeat 흐름

목표:
- Hermes 로컬 래퍼와 에이전트 권한, heartbeat 런타임 연결 정리
- AgentDetail 과 agents API 를 같은 축으로 묶기

파일:
- `cli/src/__tests__/company.test.ts`
- `cli/src/commands/client/company.ts`
- `cli/src/prompts/adapter.ts`
- `server/src/adapters/hermes-local-wrapper.ts`
- `server/src/adapters/registry.ts`
- `server/src/adapters/utils.ts`
- `server/src/routes/access.ts`
- `server/src/routes/agent-discovery.ts`
- `server/src/routes/agents.ts`
- `server/src/services/agent-discovery.ts`
- `server/src/services/agent-permissions.ts`
- `server/src/services/agents.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/index.ts`
- `server/src/services/issue-assignment-wakeup.ts`
- `server/src/services/plugin-host-services.ts`
- `server/src/__tests__/agent-instructions-routes.test.ts`
- `server/src/__tests__/agent-permissions-routes.test.ts`
- `server/src/__tests__/agent-permissions.test.ts`
- `server/src/__tests__/agent-skills-routes.test.ts`
- `server/src/__tests__/claude-local-adapter-environment.test.ts`
- `server/src/__tests__/cli-auth-routes.test.ts`
- `server/src/__tests__/company-branding-route.test.ts`
- `server/src/__tests__/company-portability-routes.test.ts`
- `server/src/__tests__/company-skills-routes.test.ts`
- `server/src/__tests__/health.test.ts`
- `server/src/__tests__/heartbeat-workspace-session.test.ts`
- `server/src/__tests__/instance-settings-routes.test.ts`
- `server/src/__tests__/opencode-local-adapter-environment.test.ts`
- `server/src/__tests__/private-hostname-guard.test.ts`
- `server/src/__tests__/worktree-config.test.ts`
- `server/src/__tests__/hermes-local-wrapper.test.ts`
- `ui/src/api/agents.ts`
- `ui/src/pages/AgentDetail.tsx`
- `ui/src/adapters/runtime-json-fields.tsx`

메시지 초안:
- `feat(agent-runtime): add hermes local wrapper and heartbeat workspace flow`

## 3. routine 완료 후 피드백 / 이슈 / 자산 흐름

목표:
- RoutineDetail, Inbox, IssueDetail, assets, costs, routines API 변화를 한 묶음으로 유지
- feedback draft 와 후속 이슈 흐름을 같이 남기기

파일:
- `server/src/attachment-types.ts`
- `server/src/routes/assets.ts`
- `server/src/routes/costs.ts`
- `server/src/routes/issues.ts`
- `server/src/routes/routines.ts`
- `server/src/services/routines.ts`
- `server/src/__tests__/activity-routes.test.ts`
- `server/src/__tests__/assets.test.ts`
- `server/src/__tests__/board-mutation-guard.test.ts`
- `server/src/__tests__/costs-service.test.ts`
- `server/src/__tests__/routines-routes.test.ts`
- `server/src/__tests__/routines-service.test.ts`
- `ui/src/pages/Inbox.tsx`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/RoutineDetail.tsx`

메시지 초안:
- `feat(routines): tighten feedback draft and issue follow-up flow`

## 4. DB 런타임 / 마이그레이션 / 테스트 기반 정리

목표:
- embedded postgres 와 runtime config, validator, migration snapshot 을 한 묶음으로 유지

파일:
- `packages/db/TESTING.md`
- `packages/db/src/migrations/0047_awesome_speed_demon.sql`
- `packages/db/src/migrations/meta/0047_snapshot.json`
- `packages/db/src/migrations/meta/_journal.json`
- `packages/db/src/runtime-config.test.ts`
- `packages/db/src/test-embedded-postgres.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/validators/agent.ts`
- `server/src/test-setup.ts`
- `server/src/__tests__/workspace-runtime.test.ts`

메시지 초안:
- `feat(db): add runtime config coverage and migration 0047`

## 5. 도구 체인 / 문서 / 릴리스 보조 변경

목표:
- 위 커밋들이 지나간 뒤 마지막에 남는 설정과 문서를 정리

파일:
- `doc/DATABASE.md`
- `doc/DEVELOPING.md`
- `docker-entrypoint.sh`
- `package.json`
- `server/package.json`
- `ui/package.json`
- `server/vitest.config.ts`
- `ui/vite.config.ts`
- `tsconfig.json`
- `pnpm-lock.yaml`
- `scripts/provision-worktree.sh`
- `scripts/release-lib.sh`
- `server/ui-flow-proof.txt`

메시지 초안:
- `chore(tooling): align docs scripts and workspace configs`

## 현재 확인된 검증 상태

성공:
- `pnpm vitest run ui/src/components/TinkerAtroposOpsBoard.test.tsx`
- `pnpm --filter @paperclipai/ui typecheck`

실패:
- `pnpm dev:once`
  - 원인: `Database has tables but no migration journal; automatic migration is unsafe. Initialize migration history manually.`
  - 따라서 브라우저 실화면 검증은 아직 못 했다.

## 바로 다음 액션

1. 1번 커밋 묶음부터 스테이징
2. `MissionControlCompanyBoard` 테스트까지 같이 돌려 대시보드 보드 묶음 검증
3. dev DB migration journal 문제를 따로 복구한 뒤 브라우저 검증 재개
