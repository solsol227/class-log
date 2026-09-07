# PR24 운영 UX·일정 카테고리 구현 보고

## 1. 작업 기준과 변경 파일

- 작업 위치: `C:\dev\class-log\.worktrees\operator-ux`
- 브랜치: `feat/operator-ux-and-schedule-categories`
- HEAD 및 최신 origin/main: `13f1365` (PR23 merge). PR22 merge `b95ac71` 포함.
- 원래 `C:\dev\class-log`의 main checkout과 `.worktrees/pr24`의 취소된 조사 브랜치는 보존했다. 취소된 학생 배정 오류는 조사하지 않았다.
- commit / push / PR 생성 / merge 없음.

수정 파일:

- `src/app/operator/schedules/actions.ts`
- `src/app/operator/schedules/schedule-form.tsx`
- `src/app/operator/schedules/page.tsx`
- `src/app/operator/schedules/[lessonId]/page.tsx`
- `src/app/operator/schedules/[lessonId]/schedule-dashboard.tsx`
- `src/app/operator/students/[id]/actions.ts`
- `src/app/operator/students/[id]/student-profile-card.tsx`
- `src/app/operator/students/new/student-create-form.tsx`
- `supabase/tests/20260901000000_excused_makeup_workflow.sql`
- `supabase/tests/20260902000000_neutral_lessons_allowances.sql`
- `supabase/tests/20260904010000_assignment_and_draft_privacy.sql`
- `supabase/tests/concurrency/save.sql`
- `docs/product-plan.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/tasks.md`, `docs/dev-log.md`, `scripts/README.md`

추가 파일:

- `src/lib/lessons/category.ts`
- `src/components/schedule-category-badge.tsx`
- `supabase/migrations/20260904030000_operator_ux_and_schedule_categories.sql`
- `supabase/tests/operator_ux_preflight.sql`
- `scripts/test-operator-ux-db.mjs`
- 이 보고서 `docs/pr24-operator-ux-review.md`

## 2. 화면별 구현

| 화면 | 구현 |
|---|---|
| 일정 등록 | 평일·주말·체험 필수 선택, 서버와 DB에서 신규 분류 검증 |
| 일정 수정 | 현재 분류 유지, 취소 시 저장 전 값 유지, 기존 미분류 일정의 다른 정보 저장 허용 |
| 일정 목록 | 전체·평일·주말·체험·미분류, category/status/month/q URL 유지, 일정 자체 분류 기준 필터·배지 |
| Migration 적용 전 조회 | 신규 컬럼 SELECT의 42703에 한해 기존 컬럼으로 재조회하여 목록·상세를 미분류로 정상 표시 |
| 목록 월·검색 | 최신 main에 없던 입력을 추가. KST 시작월과 일정 제목 검색, 상태 탭과 조합 |
| 모바일 필터 | 작은 화면 단일 열, min-width 0, 상태 탭 줄바꿈 |
| 학생 상세 | 기본정보 수정과 프로그램 관리 각각의 저장·취소·성공/미저장 안내 |
| Draft 상세 | 취소 버튼 숨김. 기존 삭제 확인과 데이터 보호 유지 |
| 확정 상세 | 기존 취소 동작 유지 |
| 연속 일정 등록 | PR21에 이미 존재하는 상단 별도 ‘새 일정 등록’ 링크 유지. 복제 없음 |
| 학생 등록 비밀번호 | 기존 press-and-hold 유지. aria-pressed/controls, 창 blur·visibilitychange, 전역 pointerup/cancel, 터치 경계 이탈 보완 |

## 3. 카테고리와 배정 정책 분리

`lessons.schedule_category`는 nullable text + CHECK이며 이용권 `student_programs.program_type`과 관계를 만들지 않는다. 카테고리는 quota·이용기간·시간 충돌·보강 계산의 조건이 아니다.

일정 RPC는 기존 시간·상태·선택 이용권 집합이 같으면 lesson row lock 아래 제목·장소·메모·카테고리만 수정한다. 배정 upsert나 출결·보강·이용권 변경을 실행하지 않는다. 나머지 저장 경로의 기존 이용권/충돌 검증과 학생 잠금 순서를 유지한다.

## 4. 학생 저장 분리와 보호

- `save_student_profile`: students 기본정보만 갱신한다. 프로그램 변경 입력을 받지 않는다.
- `save_student_programs`: 해당 학생 row를 잠근 뒤 프로그램 변경 묶음만 하나의 transaction으로 처리한다. 기본정보/Auth 값을 받거나 재전송하지 않는다.
- 기존 통합 RPC의 앱 참조는 제거했다. 같은 Supabase를 쓰는 기존 Vercel 배포와의 전환 호환을 위해 DB 함수는 이번 migration에서 유지하고, 새 코드 배포 확인 뒤 후속 migration에서 제거한다.
- active 중복 CHECK/unique 보호, 미래 배정 중단 방지 trigger, 기존 enrollment와 assignment 귀속을 유지한다. 재개 시 새 enrollment를 만들고 중단 이력과 사유는 보존한다.
- 저장 성공은 redirect 대신 action 결과로 해당 편집 영역만 닫는다. 다른 영역의 편집 상태를 유지하며 프로그램 편집 snapshot은 기본정보 저장의 revalidation으로 바꾸지 않는다.
- 이름 변경의 Auth 이메일 갱신과 DB 실패 시 복구 흐름을 기본정보 action에 유지했다. 복구 자체 실패도 별도 안내한다. 진단 로그에는 오류 코드만 남긴다.

## 5. Migration 초안·영향·적용 상태

신규 migration은 `20260904030000_operator_ux_and_schedule_categories.sql` 한 개다.

1. nullable `schedule_category`와 허용값 CHECK 추가.
2. 새 INSERT에만 카테고리 필수 trigger 추가. 기존 NULL row는 수정 가능.
3. 일정 저장 RPC에 명시적 `lesson_category` 인자 추가 및 정보만 저장하는 경로 추가.
4. 기본정보/프로그램 전용 RPC 생성, operator 검사·SECURITY INVOKER·고정 search_path·authenticated EXECUTE 설정.
5. 기존 Vercel 배포 호환을 위해 8인자 일정 RPC와 통합 학생 RPC를 유지. 새 앱은 각각 9인자 일정 RPC와 분리 학생 RPC를 사용한다.

기존 적용 migration은 수정하지 않았다. 기존 일정 제목·요일·학생을 이용한 추측이나 backfill이 없고 사용자 row UPDATE/DELETE/INSERT도 migration 본문에서 실행하지 않는다. 기존 RLS 정책은 변경하지 않는다.

사용자 승인 후 2026-09-07에 원격 적용했다. 적용 전 dry-run에서 이 migration 한 건만 대상임을 확인했고, 적용 후 local/remote **32건 일치**, local-only/remote-only **0건**이다. 기존 일정 12건은 모두 NULL(미분류)로 유지됐다.

배포 영향: 기존 조회와 학생 저장, 기존 일정 수정은 호환 경로로 유지된다. 다만 신규 INSERT 카테고리 trigger 때문에 migration 적용 뒤 기존 Vercel 코드에서는 새 일정 등록이 거부된다. DB 적용 직후 새 코드를 배포해야 하며, 배포 완료 전 짧은 등록 중단 구간이 있다. ALTER TABLE과 함수 DDL의 짧은 잠금도 발생할 수 있다.

## 6. 검증 결과와 미검증

통과:

- ESLint
- `tsc --noEmit --incremental false`
- production build
- `git diff --check`
- 원격 읽기 전용 컬럼·trigger·RLS·RPC·건수 사전 확인
- 원격 기존 schema `supabase db lint --linked`: 오류 없음
- 원격 적용 후 `schedule_category` 컬럼·CHECK·신규 INSERT trigger와 구·신 RPC 병존 확인
- 원격 적용 후 `supabase db lint --linked`: 오류 없음
- 메모리 PostgreSQL(PGlite)에서 기존 31개+신규 1개 migration 순차 실행
- 합성 데이터 34개 회귀 assertion: 신규 필수/잘못된 분류, 기존 NULL 수정, 월별 이용권과 다른 분류 배정, 체험·대여의 평일 배정, quota 초과·시간 중복 차단, 일반/보강 원수업/대체 일정의 카테고리 변경 시 연결 데이터 동일, Draft 삭제 보호·확정 취소, 독립 저장, 프로그램 묶음 rollback/중복/중단/재개/사유, 학생 자기 row·Draft RLS·RPC 권한

미검증:

- Docker/Supabase 로컬 DB lint. PGlite migration 실행과 회귀 검사로 보완했지만 동일한 검사는 아니다.
- 기존 pgTAP 파일 전체와 실제 두 세션 동시성 테스트. 해당 fixture의 분류 인자만 신규 schema에 맞췄다.
- 실제 Supabase Auth 이메일 변경 및 실패 복구. 로컬 DB 테스트의 Auth는 최소 플랫폼 bootstrap이다.
- 브라우저 입력·취소·동시 두 영역 편집 보존·URL 필터 왕복·모바일 레이아웃·키보드/포인터 비밀번호 표시. 사용자가 직접 확인한다.

production build에서 중첩 worktree의 lockfile로 인한 workspace-root 경고가 있었으나 빌드는 성공했다. 무관한 Next 설정 변경은 하지 않았다.

## 7. 사용자 데이터

원격 사용자 학생·일정·출결·이용권·보강 데이터 변경 **없음**. 승인된 migration의 schema·함수·trigger DDL만 적용했다. 원격 seed, 테스트 배정·차감·중단·삭제, backfill, history repair 없음. 로컬 회귀 데이터는 메모리에만 존재하고 종료 시 폐기된다.

## 8. 직접 확인 URL과 순서

이 worktree의 production 서버를 `http://127.0.0.1:3001`로 실행했다. 기존 3000 서버와 구분한다.

신규 migration 적용 후 아래 기능을 사용자가 직접 확인한다. 테스트용 실제 데이터가 필요하면 운영에 남겨도 되는 값만 사용하고, 이용권 차감·중단·삭제를 검증 목적으로 실행하지 않는다.

1. http://127.0.0.1:3001/login/operator — 운영자 로그인.
2. http://127.0.0.1:3001/operator/schedules/new — 카테고리 미선택 오류, 선택 후 등록. 학생/입력값을 복제하지 않는 새 일정 링크 확인.
3. http://127.0.0.1:3001/operator/schedules?category=unclassified — 기존 미분류 일정 열기. 분류 없이 제목 수정 가능 여부, 분류 선택 후 취소/저장 확인.
4. http://127.0.0.1:3001/operator/schedules?category=weekend&status=draft&month=2026-09&q= — 필터 적용 후 상태 탭, 검색/월 변경, 새로고침에서 URL과 선택 유지 확인. 배정 유무와 무관한 분류 결과 확인.
5. 목록에서 Draft/확정 일정 열기 — Draft 취소 버튼 비노출, 기존 삭제 안내, 확정 취소 유지 확인. 보존 기록이 있는 일정은 삭제 우회하지 않는다.
6. http://127.0.0.1:3001/operator/students — 학생을 선택하여 두 편집 영역을 동시에 열고 각각 저장·취소. 한 영역의 미저장 내용이 다른 영역 저장 뒤 유지되는지 확인.
7. http://127.0.0.1:3001/operator/students/new — 제출 없이 비밀번호 눈 버튼을 포인터/키보드로 누르고 놓기, 바깥 이동, 초점/창 이동 및 모바일에서 다시 가려지는지 확인.
8. http://127.0.0.1:3001/student/schedule — 학생 로그인에서 본인 확정 일정만 표시되는지 확인.

## 9. Diff 요약

일정 UI·action 5개, 학생 UI·action 3개, 공통 category 모듈/배지 2개, 신규 migration 1개, 테스트/재실행 문서와 프로젝트 문서를 변경했다. 기존 DB migration 31개는 그대로다. 범위 제외 기능은 구현하지 않았다.

## 10. Git 상태

HEAD는 `13f1365`, 기능 브랜치와 origin/main 사이 commit 차이는 없다. 코드·SQL·테스트·문서 변경은 모두 **unstaged/untracked** 상태이며 staged 변경은 없다. 수정 18개·추가 6개(이 보고서 포함), 총 24개 파일이다.

원래 main checkout의 기존 `.worktrees/` untracked 상태는 보존했다. 생성한 worktree 외에 기존 작업 파일을 변경하거나 버리지 않았다.
