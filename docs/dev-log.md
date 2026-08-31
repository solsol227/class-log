# Class Log 개발 기록

작업 세션이 끝날 때마다 최신 항목을 맨 위에 추가한다.

목적은 다음 작업자나 다음 Codex 세션이 git log와 긴 대화를 처음부터 뒤지지 않고도 현재 상태를 이해하게 하는 것이다.

## 형식

```md
## YYYY-MM-DD — 담당자 — 작업명/PR/이슈

- 한 일:
- 확인된 것:
- 다음 할 일 / 막힌 것:
```

해당 내용이 없으면 줄을 생략해도 된다.

---

<!-- 아래부터 최신 항목을 위에 추가 -->

## 2026-08-31 — Codex — PR #18 운영 UX 개선 구현

- 한 일: 직원 이름/역할 수정, 항상 복원 가능한 직원 보관, 삭제 직원 복원, 직원 상세 대시보드, 담당자 차등 갱신, 보강 사유 수정과 requested 삭제, cancelled 이력 표시, 역할별 로그인 페이지의 로그인 선택 링크를 구현했다.
- 한 일: 일정 종료 시각 기반 표시 상태, 일정 상세 중복 제목 제거, 피드백 댓글 작성자, 학생 내 일정 담당 직원 표시를 브라우저 피드백으로 추가했다.
- 한 일: 일정 상세 저장 버튼을 상단 action으로 이동하고, `lessons.completed`를 출결 완료가 아닌 일정 종료 시각 경과 의미로 통일했다. 출결 action의 lesson 상태 변경을 제거하고 Draft 차단을 일관되게 적용했다.
- 한 일: 일정 저장 DB trigger/RPC와 운영자 조회 범위 동기화 RPC를 append-only `20260831120000_align_lesson_status_with_time.sql`로 추가했다. 학생 조회는 DB를 변경하지 않고 시간 기준 표시 fallback만 사용한다.
- 확인된 것: 기존 `is_active`를 내부 검증에 유지하고 상시 활성 토글은 제거했다. 보관 직원의 기존 `lesson_staff`와 `lesson_feedback` 관계 및 과거 role은 유지하며, 신규 담당자와 피드백 작성자 선택에서는 제외한다.
- 확인된 것: `20260828000000_add_operator_ux_workflows.sql`과 후속 append-only `20260831000000_refine_operator_ux_workflows.sql`을 원격에 적용했다. 후속 migration에서 직원 삭제를 항상 보관하도록 재정의했다.
- 확인된 것: ESLint, TypeScript, production build, `git diff --check`를 통과했다.
- 다음 할 일: 운영자 브라우저에서 직원 보관/복원과 requested 보강 사유 수정·삭제를 실제 데이터 정책에 맞게 확인한다. PR #19에서 특정 excused attendance 기반 보강, assignment provenance와 scheduled 안전 삭제를 함께 설계한다.

## 2026-08-28 — 문서 체계 추가

- 한 일: 최신 `main`에서 Class Log 프로젝트 하네스, 제품·아키텍처·설계 결정·작업 계획·개발 기록·UX·Git·Supabase migration 안전 문서를 추가했다.
- 확인된 것: 기준 merge commit `dc69f7bc072aabf5d81399870f5469179b05d793`, migration 17개와 PR #16 신규 migration 11개, 주요 schema/RPC/RLS 및 보강 cache revalidation이 실제 코드와 일치한다.
- 확인된 것: `AGENTS.md`와 `CLAUDE.md`는 하네스 문서로 안내하는 얇은 진입점으로 유지했다.
- 다음 할 일: 실제 구현이나 결정이 바뀌는 PR에서 관련 원본 문서와 이 기록을 함께 갱신한다.


## 2026-08-27 — PR #16 merge 완료

- 한 일: 데이터모델·Draft·시간충돌·직원·피드백·보강 기능을 최종 검증하고 PR #16을 일반 merge했다.
- 확인된 것: merge commit `dc69f7bc072aabf5d81399870f5469179b05d793`, main/origin/main 일치, local/remote migration 17개 일치, ESLint/production build/git diff --check 성공, working tree clean.
- 확인된 것: 기존 학생 2건, 일정 3건 조회 정상. 운영자 일정/학생관리, 학생 내 일정 접근 정상. 학생 Draft 미노출 정상.
- 확인된 것: 보강 배정 미반영처럼 보이던 원인은 DB/RPC가 아니라 cache revalidation 누락이었다. 관련 화면 revalidate로 수정했다.
- 확인된 것: Draft lesson도 보강 replacement로 정상 지원하며 assignment/enrollment/충돌/Draft 비노출을 검증했다.
- 다음 할 일: 문서 PR 반영 후 직원/보강 수정·삭제, 로그인 뒤로가기, 사유결석 기반 보강, 학생 일정 상세를 후속 PR로 진행한다.



## 2026-08-26 — 문서 준비 — Class Log 하네스 초안

- 한 일: 탐라모아의 `AGENTS.md → SKILL.md → 원본 문서 → 조건부 문서` 구조를 참고해 Class Log용 문서 체계를 별도 작업 공간에 준비했다. 제품/아키텍처/UX/Git/tasks/decisions/dev-log/Supabase migration 규칙을 각각 단일 책임 문서로 분리했다.
- 확인된 것: 이 문서 세트는 현재 진행 중인 Codex 데이터모델 구현과 충돌하지 않도록 아직 Class Log repo에는 넣지 않는다.
- 다음 할 일 / 막힌 것: Codex 구현이 완료된 뒤 실제 schema·RLS·RPC·UI 결과와 `docs/architecture.md`, `docs/tasks.md`를 대조해 최신 상태로 한 번 동기화한 후 repo에 반영한다.

## 2026-08-26 — Codex/사용자 — 데이터모델 사전 조사

- 한 일: 실제 public schema와 코드 사용처를 점검하고 학생/프로그램/Draft/시간충돌/staff/feedback/comments/makeup 구조 방향을 확정했다.
- 확인된 것: 현재 students 2명(진솔, 도형), 기존 lesson 2건 모두 평일보컬, assignment 4건 중 active 3건/soft-unassigned 1건, lesson_feedback 0건, feedback_responses 0건, makeup_lessons 0건.
- 확인된 것: `recorded_at`, monthly item `student_id`, `position`, assignment soft-unassign 구조, attendance UNIQUE, lesson 시간순서 constraint는 실제 사용 이유가 있어 유지하기로 했다.
- 다음 할 일 / 막힌 것: 최신 main 기준 데이터모델 구현 결과를 Phase별로 검증한다.

## 2026-08-25 — Codex — PR #15 Supabase security hardening

- 한 일: `20260825220000_harden_security_definer_helpers.sql`을 적용하고 PR #15를 main에 병합했다.
- 확인된 것: `rls_auto_enable()`은 `SECURITY DEFINER`, `search_path=pg_catalog`을 유지하면서 외부 execute 권한을 제거했다. `current_student_id()`는 private schema로 이동하고 authenticated execute 및 기존 RLS dependency를 유지했다. local/remote migration 6개 일치, `supabase db lint`, `npm run lint`, `npm run build`, `git diff --check` 통과.
- 다음 할 일 / 막힌 것: Security Advisor의 `auth_leaked_password_protection` 1건은 Supabase Auth Dashboard 설정으로 별도 처리한다.
