# Paperclip + Hermes Adapter 개선 분석 리포트
## Mission Control 대비 비교 분석

> 분석 일자: 2026-04-01
> 분석 도구: RepoPrompt Context Builder
> 대상: Paperclip (v0.3.1) + hermes-paperclip-adapter (v0.2.0) vs Mission Control

---

## 1. 핵심 비교 매트릭스

| 영역 | Paperclip | Mission Control | 판정 |
|------|-----------|-----------------|------|
| **에이전트 실행 지속성** | ✅ 매우 강함 (heartbeat_runs, orphan reap, resume) | ⚠️ 보통 (OpenClaw 의존) | Paperclip 우위 |
| **세션 연속성** | ✅ agent_task_sessions + sessionCodec + compaction | ⚠️ openclaw_sessions 의존 | Paperclip 우위 |
| **예산/비용 제어** | ✅ 실행 루프에 통합 (차단/일시정지/취소) | ⚠️ 있지만 실행과 느슨하게 결합 | Paperclip 우위 |
| **거버넌스/승인** | ✅ 승인+이슈 연결+감사 | ⚠️ dispatch 게이트+승인 | Paperclip 우위 |
| **스킬 관리** | ✅ 출처/신뢰/호환성/동기화 | ⚠️ 파일시스템 스캔 수준 | Paperclip 우위 |
| **어댑터 다양성** | ✅ 8종 (Claude/Codex/Hermes/Cursor/OpenCode 등) | ❌ OpenClaw 단일 | Paperclip 우위 |
| **조직/회사 모델** | ✅ 멀티테넌트 (회사/프로젝트/에이전트/보고체계) | ⚠️ 워크스페이스 단위 | Paperclip 우위 |
| **실시간 UI** | ⚠️ WebSocket 이벤트 | ✅ SSE + Socket.IO 하이브리드 | Mission Control 우위 |
| **플래닝/오케스트레이션** | ❌ 없음 | ✅ 대화형 플래닝 파이프라인 | Mission Control 우위 |
| **작업 투명성** | ⚠️ run 로그/이벤트 | ✅ activities/deliverables/subagent | Mission Control 우위 |
| **에이전트 디스커버리** | ❌ 수동 생성만 | ✅ Gateway에서 자동 발견/임포트 | Mission Control 우위 |
| **라이브 피드/대시보드** | ⚠️ 기본적 | ✅ 실시간 카운터/피드/상태 | Mission Control 우위 |

---

## 2. Paperclip에 개선이 필요한 영역 (Mission Control 참고)

### 🔴 P0: 높은 우선순위

#### 2.1 대화형 플래닝 파이프라인
**Mission Control에 있고 Paperclip에 없는 핵심 기능**

- MC는 태스크 실행 전에 에이전트와 대화형 플래닝 세션을 진행
- 플래닝 결과로 에이전트 자동 생성, 작업 분배 가능
- Paperclip은 이슈를 만들고 바로 에이전트에 배정 → 중간 계획 단계 없음

**개선안:**
- `/api/issues/:id/planning` 엔드포인트 추가
- 플래닝 질문/답변 루프 (planning_questions, planning_specs 테이블)
- 플래닝 완료 시 자동 dispatch 또는 pending_dispatch 상태 전환
- UI에 PlanningTab 컴포넌트 추가

#### 2.2 작업 투명성 시스템 (Activities/Deliverables)
**MC의 가장 큰 강점 중 하나**

- MC는 에이전트 작업 중 활동 로그(activity_logged), 산출물(deliverable_added), 서브에이전트(subagent) 추적
- Paperclip은 run 로그와 stdout만 기록 → 진행 상황 가시성 부족

**개선안:**
- `task_activities` 테이블 추가 (작업 중 세부 활동 기록)
- `task_deliverables` 테이블 추가 (산출물 추적)
- 에이전트가 호출하는 콜백 API (`/api/issues/:id/activities`, `/api/issues/:id/deliverables`)
- 실시간 이벤트로 UI에 즉시 반영

#### 2.3 라이브 피드 강화
**현재 Paperclip의 실시간 UI는 기본적**

- MC는 SSE로 task_created/task_updated/activity_logged 등 세분화된 이벤트 스트리밍
- 실시간 카운터, 에이전트 상태 표시, 라이브 피드 컴포넌트
- Paperclip WebSocket은 있지만 UI 활용이 제한적

**개선안:**
- 이벤트 타입 세분화 (현재보다 더 많은 이벤트 종류)
- 대시보드에 실시간 활동 피드 위젯 추가
- 에이전트 사이드바에 실시간 상태/카운터 표시

### 🟡 P1: 중간 우선순위

#### 2.4 에이전트 자동 디스커버리
- MC는 OpenClaw Gateway에서 에이전트를 자동 발견하고 임포트 가능
- Paperclip은 수동으로 에이전트를 생성해야 함

**개선안:**
- 로컬 Hermes/Claude/OpenCode 설치를 자동 감지하는 `/api/agents/discover` 엔드포인트
- 감지된 에이전트 원클릭 임포트
- 어댑터별 `testEnvironment` 결과를 활용한 자동 설정 제안

#### 2.5 워크플로우/DAG 오케스트레이션
- MC에도 완전한 DAG는 없지만 플래닝 → dispatch → completion 체인이 있음
- Paperclip은 단일 이슈 → 단일 실행 모델

**개선안:**
- 이슈 간 의존성 관계 (parentId는 있지만 활용 부족)
- 선행 이슈 완료 시 후행 이슈 자동 dispatch
- 프로젝트 레벨에서 작업 DAG 시각화

#### 2.6 서브에이전트 추적
- MC는 서브에이전트 등록/완료를 추적하는 API가 있음
- Paperclip은 Hermes의 서브에이전트 위임을 알지 못함

**개선안:**
- `subagent_sessions` 테이블 추가
- Hermes의 delegate_task 사용 시 Paperclip에 등록하는 콜백
- UI에서 메인 에이전트와 서브에이전트 관계 시각화

### 🟢 P2: 낮은 우선순위

#### 2.7 하이브리드 실시간 전송
- MC는 SSE(태스크) + Socket.IO(크론/메모리/문서) 이중 채널
- Paperclip은 WebSocket 단일 채널
- 현재로도 충분하지만, 이벤트 유형별 채널 분리 검토 가능

#### 2.8 보안/샌드박스 강화
- 양쪽 다 로컬 CLI 에이전트는 비샌드박스
- MC도 마찬가지이므로 업계 공통 과제
- 장기적으로 Docker 격리 또는 워크트리 격리 강화 필요

#### 2.9 분산 제어면
- Paperclip과 MC 모두 단일 프로세스
- 장기적으로 멀티노드 지원 검토 (Redis pub/sub 등)

---

## 3. Paperclip이 이미 우수한 영역 (유지/강화)

### ✅ 유지해야 할 강점

1. **내구성 있는 실행 모델** — orphan reap, queued resume, 세션 compaction
2. **예산 제어의 실행 통합** — 실행 차단/취소/인시던트까지 자동
3. **어댑터 포터빌리티** — 8개 에이전트 런타임 지원
4. **스킬 공급망** — 출처/신뢰/호환성까지 관리
5. **멀티테넌트 조직 모델** — 회사/프로젝트/보고체계
6. **Hermes 통합 품질** — 서버+UI 양쪽 깔끔한 어댑터 경계

---

## 4. 구현 우선순위 로드맵

```
Phase 1 (즉시):
  → Activities/Deliverables API + 테이블
  → 라이브 피드 UI 강화

Phase 2 (1-2주):
  → 대화형 플래닝 파이프라인
  → 에이전트 자동 디스커버리

Phase 3 (2-4주):
  → 서브에이전트 추적
  → 이슈 간 의존성/DAG
  → 워크플로우 시각화

Phase 4 (장기):
  → 보안/격리 강화
  → 분산 제어면
  → 포트폴리오 대시보드
```

---

## 5. 결론

**Paperclip의 핵심 강점은 "운영 내구성"** — 실행 지속성, 세션 연속성, 예산 통합이 탁월함.
**Mission Control의 핵심 강점은 "운영 가시성"** — 플래닝, 활동 추적, 실시간 피드가 탁월함.

두 시스템의 장점을 합치면:
> **내구성 있는 실행 + 투명한 가시성 = 최적의 에이전트 오케스트레이션**

Paperclip에 MC의 투명성 기능(activities, deliverables, planning)을 추가하면
현존 오픈소스 중 가장 완성도 높은 에이전트 오케스트레이터가 될 수 있음.
