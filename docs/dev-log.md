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

## 2026-09-04 — Codex — 동시성·로컬 로그인 수정 및 최종 리뷰

- 한 일: 기존 미커밋 변경을 보존하고 append-only migration 2건을 추가했다. 적용된 기존 migration은 수정하지 않았다. 확정 RPC의 학생 잠금 순서를 저장 RPC와 통일하고, 학생 상세의 단일 추가 배정을 전용 RPC로 바꿨으며 학생용 Draft 개수·Draft 전용 월 노출을 차단했다.
- 원인: 기존 확정 RPC는 enrollment UUID, 저장 RPC는 학생 UUID 순으로 잠갔다. 순서가 반대인 실제 Draft에서 두 DB 세션으로 deadlock을 재현했다. 수정 후 같은 경합에서 두 RPC가 모두 성공했고 일정·배정·조정 전체 row 해시가 전후 동일했다.
- 원인: 로컬 로그인은 브라우저용 새 세션과 SSR 검증이 유효해도 네트워크 제한 상태의 Next 서버에서 역할 API 401/보호 페이지 만료 redirect가 발생했다. 같은 빌드를 Supabase 접속 허용 상태로 재시작하자 200으로 복구됐다. 인증 연결 실패를 만료로 오인하거나 signOut하지 않도록 503/일시 오류 안내 및 쿠키 보존 처리를 추가했다.
- 확인된 것: 인증 장애·무효 JWT·역할 검증 회귀 5개, 최종 ESLint·production build/TypeScript, DB lint가 통과했다. local/remote migration 30건이 일치한다. 추가 rollback SQL로 운영자 배정 보존·중복 차단, 학생 Draft/타학생 비노출, 학생 mutation·anon RPC 차단을 확인했다.
- 확인된 것: 최종 production 서버 `127.0.0.1:3000`에서 실제 운영자/학생의 역할 API·보호 페이지가 모두 HTTP 200, 비인증 역할 API는 401로 확인됐다.
- 제한: pgTAP/Docker와 브라우저 클릭 자동화 대신 실제 원격 두 세션·rollback SQL 및 로컬 HTTP 인증 검증을 사용했다. 재실행 방법은 `supabase/tests/concurrency/README.md`, `scripts/README.md`에 기록했다.

## 2026-09-04 — Codex — 중립 lesson 원격 DB 검증

- 확인된 것: production build 재확인 통과. `next start`를 127.0.0.1:3000에서 실행하고 운영자 로그인 HTTP 200 응답을 확인했다.
- 확인된 것: 신규 모델, lint 정리, rollback 검증 migration 3건을 원격에 적용했다. local/remote 28개 migration이 일치하며 DB lint는 경고 없이 통과했다.
- 확인된 것: 원격 rollback 검증에서 Scheduled 차감, Draft 제외, 안전한 Scheduled→Draft/취소/soft-unassign 반환, assignment hard delete 차단, rental의 enrollment 전체기간 누적, 기존 makeup source 정합성을 확인했다. 검증 데이터는 subtransaction으로 rollback했다.
- 확인된 것: 실제 operator/student/anon 세션으로 본인 quota RPC, 타학생 및 adjustment 감사 row 비노출, 학생 mutation 차단, anon RPC 차단을 확인했다.
- 제한: pgTAP CLI는 Docker가 없어 실행하지 못해 rollback 검증으로 대체했다. 실제 동시 요청 부하 테스트는 별도 미실행이다. commit/push/PR/merge 및 Final Review 전환은 하지 않았다.

## 2026-09-02 — Codex — 중립 lesson과 학생 프로그램 이용권

- 한 일: lesson 프로그램 분류와 exact-match 경로를 제거하고, 학생별 assignment가 선택한 `student_program_id`를 이용권으로 사용하도록 일정 RPC/UI를 전환했다. Draft는 quota에서 제외하고 Scheduled 확정·신규 배정·월 이동을 DB lock 아래 검증하며, 시작 전이고 attendance/feedback이 없는 배정만 반환되도록 보호했다. 출결·피드백 생성과 반환도 lesson row lock으로 직렬화하고 assignment hard delete를 차단했다.
- 한 일: `base_allowance_count`, append-only `student_program_allowance_adjustments`, quota 집계 view, 운영자 조정 UI를 추가했다. 기존 rental 제공량은 추측하지 않고 미설정으로 보존하며 설정 전 배정을 막는다.
- 한 일: 학생 화면에는 adjustment 감사 row를 노출하지 않고 본인 집계만 반환하는 전용 RPC를 연결해 일반·보강 잔여량과 일정별 사용 이용권을 표시했다.
- 한 일: makeup에 immutable `source_student_program_id`를 backfill하고 replacement assignment가 source enrollment를 사용하도록 생성·배정·재배정 함수를 변경했다. stopped source도 허용하고 lesson 프로그램 비교는 제거했다.
- 확인된 것: `npx tsc --noEmit`, ESLint, production build가 통과했다. 로컬 Supabase CLI/config가 없어 migration 실제 적용과 DB lint는 아직 수행하지 못했다.
- 다음 할 일 / 막힌 것: 연결 DB에서 preflight를 다시 확인한 뒤 migration 적용, pgTAP, operator/student RLS와 동시 quota 요청을 검증해야 한다.

## 2026-09-02 — Codex — PR #21 운영 화면 UX 개선

- 한 일: 학생 신규 등록의 현재 입력 비밀번호를 포인터 또는 키보드로 누르는 동안만 표시하고, release/leave/cancel/blur에서 즉시 숨기는 접근 가능한 보기 버튼을 추가했다.
- 한 일: 일정관리 목록에 전체·예정·완료·Draft·취소 URL query 필터와 display status 기준 count/빈 상태를 추가하고, 일정 상세에 보조 계층의 새 일정 등록 링크를 추가했다.
- 한 일: 직원 저장/삭제를 독립 form 상태로 한 줄 배치하고, 보강 원수업 정보 sub-card 전체를 일정 상세 링크로 만들었다.
- 확인된 것: DB schema, migration, RPC, RLS, 데이터 query 및 mutation action은 변경하지 않았으며 ESLint, TypeScript, production build를 통과했다.
- 다음 할 일: production UI에서 포인터·키보드 비밀번호 보기, 일정 필터/빈 상태, 직원 버튼, 원수업 링크를 사용자 확인한다.

## 2026-09-01 — Codex — 학생정보·이용프로그램 통합 관리

- 한 일: 학생 기본정보, 프로그램 중단, stopped 사유 수정, 이용 시작·재개를 `save_student_profile_and_programs` RPC 한 transaction으로 저장하도록 통합했다.
- 한 일: 독립 프로그램 추가·중단 UI/action을 제거하고 학생정보 `수정 → 저장/취소` 안에서 active 중단일·사유, stopped history 사유, 새 이용기간 시작일을 함께 편집하도록 변경했다.
- 한 일: 학생 목록을 이름 검색 + 독립 이용프로그램 필터 + 전체·진행중·휴식·이용종료 상태 탭으로 정리하고 모든 조건을 URL query로 유지했다. 장기 미배정은 별도 탭 대신 진행중 행 배지와 마지막 배정 경과로 표시한다.
- 확인된 것: 학생 10명, enrollment 10건에서 active 중복·assignment 연결 누락·program 불일치·stopped enrollment 활성 참조가 없었다. 저장 active 기준 진행중은 9명이며 그중 effective inactive 1명은 장기 미배정 배지로 구분되고, 휴식은 1명이다.
- 확인된 것: rollback 원격 검증에서 stopped 이력 보존+새 active 재개, 중단 사유 수정, active 중복 차단, 미래 배정 중단 실패 시 profile까지 전체 rollback을 확인했다. 검증 row는 남지 않았다.
- 다음 할 일: production UI에서 통합 저장과 학생 목록 필터를 사용자 확인한다. 승인 전 commit/push/PR/merge하지 않는다.

## 2026-09-01 — Codex — PR #19 사유결석 기반 보강 구현

- 한 일: excused 출결과 `makeup_lessons`를 필수 UNIQUE FK로 연결하고, replacement 출결·assignment provenance·operator event history를 추가한 append-only migration을 원격에 적용했다.
- 한 일: requested 매칭, scheduled 일정 변경/대기 복귀, entitlement 취소/동일 row 재개, replacement 출결 기반 완료를 RPC로 구현했다. 출결 저장 trigger는 중복 없이 entitlement를 만들고 원 출결 변경 우회를 차단한다.
- 한 일: `/operator/makeup`을 사유결석 기반 대기/예정/완료/취소 흐름으로 바꾸고 임의 생성·hard delete를 제거했다. 두 출결 저장 경로에 보강 정책 안내와 관련 cache revalidation을 연결했다.
- 한 일: 사용자 확인 결과를 반영해 원 출결 변경이 보강을 자동 취소/재개하고 대체 출결 저장이 보강을 자동 완료하도록 개선했다. 보강관리 정상 동선은 일정 배정/변경만 남겼다.
- 한 일: 대체 일정 변경에서 provenance가 created/reactivated인 이전 assignment를 안전 조건 확인 후 자동 soft-unassign하고, existing 또는 보존 기록이 있는 assignment는 보호한다.
- 한 일: 실제 일정 변경 실패를 rollback transaction으로 재현해 일반 운영자 event 원인이 NULL로 남는 23502 오류를 확인했다. append-only migration에서 NULL을 `operator`로 정규화하고 같은 일정 선택을 UI/action에서 차단했다.
- 확인된 것: 최초 적용 직전 `attendance_records`와 `makeup_lessons`는 모두 0건이었다. 사용자 확인 후에는 excused 출결 1건과 scheduled 보강 1건이 있었고 예상한 브라우저 흐름과 일치했다. 진단 변경은 전부 롤백했고 기존 row를 변경하지 않았으며 local/remote migration 24개가 일치한다.
- 막힌 것: 원격 pgTAP 명령은 연결 후에도 로컬 Docker를 요구해 실행되지 않았다. 롤백형 회귀 SQL은 저장소에 추가했으며 Docker 또는 동등한 직접 DB 실행 환경에서 재실행해야 한다.
- 다음 할 일: 정적 검사와 production build를 마치고 운영자 브라우저에서 사유결석→보강 매칭→replacement 출결 흐름을 확인한다. 사용자 승인 전 commit/push/PR/merge하지 않는다.

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
