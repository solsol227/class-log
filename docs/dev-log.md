# Class Log 개발 기록

## 2026-09-12 — Codex — PR36 학생 목표·프로필·잔여 횟수 UX

- 기준: PR34 compact UX와 PR35 직원 캘린더가 병합된 최신 `origin/main` `c5b3b08`에서 clean `feat/student-goals-and-summary` 브랜치를 만들었다. 작업 전 local/remote migration 38개 일치를 확인했다.
- 구현: nullable `students.goal`과 1000자 제약을 append-only migration으로 추가하고, 학생 등록·owner 프로필 편집·학생 내 일정의 이용권 대시보드에 연결했다. 학생 목표는 빈 상태에서 `나만의 목표를 설정해볼까요?`를 안내하고 한 줄 자동 확장 입력과 `수정` 버튼으로 저장한다. 학생정보 보기·편집의 중복 제목과 기본 설명을 제거하고 목표·특이사항을 이름 아래 compact 정보 행으로 정리했다.
- 권한: 기존 students RLS로 owner/staff 조회와 student 자기 row 조회를 유지한다. owner는 `save_student_profile`, student는 대상 ID를 받지 않는 `update_my_student_goal` 전용 RPC로 같은 컬럼을 수정한다. 학생 RPC는 JWT 역할과 `private.current_student_id()`를 확인하고 goal만 갱신하며 staff/owner의 학생 위장 호출과 anon 실행을 차단한다.
- 목록: 기존 `student_program_allowance_statuses`를 학생 목록 전체에 한 번 조회해 active enrollment의 KST 현재 월 또는 enrollment 전체 잔여 횟수만 표시한다. stopped 이력과 미설정 횟수는 제외하며 학생별 query나 신규 RPC는 없다.
- textarea: 공통 `AutoResizeTextarea`가 한 줄에서 최대 9줄까지 확장하고 이후 내부 스크롤을 사용한다. controlled/default value, form reset, 숨김·modal 재노출을 재계산하며 목표·특이사항·일정/출결 메모·피드백/댓글·보강 사유/완료 메모·월간 계획 입력에 적용했다. 날짜·시간·검색·중단 사유 select·횟수 조정 사유 input은 변경하지 않았다.
- 검증: 합성 in-memory DB에서 40개 migration과 owner/staff/student A·B/anon을 포함한 139개 assertion, ESLint, TypeScript, production build와 diff check를 통과했다. 두 번째 append-only migration 적용 후 local/remote 40개 이력이 일치하며 private DB lint는 깨끗하고 public은 기존 미사용 변수 경고 1건뿐이다. 실제 owner/student 로그인·목표 조회·학생 목표 RPC의 비변경 초과 입력 거부·운영자 학생 목록·학생 목표 대시보드 SSR과 보호 화면 HTTP 200·비인증 401도 통과했다. 사용자 데이터 mutation과 테스트 학생 생성 없이 production 브라우저 로그인 후 목표 대시보드의 조회·입력·저장·연동을 사용자가 직접 확인했다.

## 2026-09-11 — Codex — PR35 직원 담당 일정 월간 캘린더

- 기준: PR33 병합 커밋 `f21ddac`와 일치하는 최신 `origin/main`에서 별도 `feat/staff-schedule-calendar` worktree를 만들었으며, 원본과 작업 tree가 clean인 상태에서 시작했다.
- 구현: 직원 상세의 지난 일정 목록을 제거하고 KST 현재 월 기반 compact 예정 카드와 6주 월간 캘린더로 교체했다. 이전·다음 달, native month picker, `month=YYYY-MM` URL 유지·복구, 모바일 캘린더 우선 순서, 일별 2건 뒤 `+N` 전체 보기를 제공한다.
- 데이터: 선택 월의 KST `00:00 +09:00`부터 다음 달 시작 전까지만 `lesson_staff` 기준으로 조회하고, 해당 lesson ID의 `unassigned_at is null` 학생 배정과 이름을 일괄 조회한다. 카드와 캘린더는 같은 월간 결과를 재사용하며 migration, RLS, DB·Auth 사용자 데이터는 변경하지 않았다.
- 표시·접근성: 같은 날 일정은 날짜를 한 번만 표시하고 날짜가 넘어갈 때만 종료 날짜를 반복한다. 학생은 데스크톱 첫 3명, 모바일 첫 2명 뒤 `외 N명`으로 줄이며 캘린더 항목은 시간·active 학생 수를 표시한다. 제목·시간·인원·상태는 링크 접근성 이름과 tooltip에 유지하고 상태별 점과 텍스트 범례를 함께 제공한다.
- 검증: 변경 파일 ESLint, `tsc --noEmit --incremental false`, production build, 실제 owner/student 로그인·역할 API·보호 화면과 비인증 401을 통과했다. 실제 owner 세션으로 직원 캘린더 200, month 누락·오류의 현재 월 307 복구를 read-only 확인했으며 사용자 production UI 확인은 대기 중이다.

## 2026-09-11 — Codex — PR34 일정 및 학생 피드백 Compact UX

- 한 일: 운영자 일정 카테고리·상태 필터를 데스크톱 한 줄로 배치하고 학생 일정 카드, 일정 상세 4항목 정보, 내 피드백 필터·카드를 압축했다. 일정/피드백 목록의 유효 query를 제한된 내부 `returnTo`로 보존하며 외부·임의 경로는 일정 목록으로 복구한다.
- 피드백: 학생 일정 상세에서 수업 날짜·일정명·제공 직원·본문·댓글 수를 표시하고 기존 공용 댓글/답글 thread를 그대로 사용한다. 내 피드백은 직접 기간 입력을 제거하고 빠른 기간 버튼과 즉시 정렬만 제공한다.
- modal: dialog와 내부 article이 함께 스크롤하던 중첩 구조를 dialog 단일 scroll로 바꾸고, 열린 동안 배경 body scroll을 잠근다. 새 피드백 textarea는 최대 높이 이후에만 자체 스크롤한다.
- 데이터: DB schema, migration, RLS, query 의미와 사용자 데이터는 변경하지 않았다. 신규 테스트 데이터도 만들지 않았다.
- 검증: ESLint, `tsc --noEmit --incremental false`, production build, `git diff --check`를 통과했다. 실제 테스트 owner/student 로그인, 역할 API, 운영 일정, 학생 일정·피드백 HTTP 200과 학생 RLS Draft 비노출을 확인했다. 테스트 학생에게 배정된 일정이 없어 상세의 양성 HTTP 검증은 남았고, 브라우저 플러그인도 로컬 webview attach timeout으로 자동 화면 검증을 수행하지 못해 사용자 확인이 필요하다.
- 로그인 후속 수정: 서버·Supabase Auth·로컬 Origin CORS와 production 번들 공개 설정은 정상인데 브라우저 webview의 직접 Auth 요청에서만 owner/student가 함께 실패했다. 브라우저가 Supabase에 직접 연결하는 방식을 Next server action 경유 로그인으로 전환하고, 서버에서 claims·역할·operator 활성 상태를 재검증하도록 했다. 비밀번호는 저장하거나 로그에 남기지 않는다.
- 로그인 재수정: 최초 server action 구현은 로그인 직후 같은 요청의 cookie store에서 새 토큰을 다시 읽어 claims를 검사해, 아직 갱신되지 않은 cookie snapshot 때문에 정상 계정도 일시 오류가 될 수 있었다. `signInWithPassword`가 반환한 access token을 직접 검증하고 같은 토큰의 authenticated client로 운영자 context를 확인하도록 변경했다.
- Compact UX 재수정: 학생 일정 상세 4항목은 breakpoint와 관계없이 한 행을 유지하고 좁은 화면에서는 해당 정보 행만 가로 스크롤한다. 내 피드백 카드의 문구를 `상세보기`로 통일하고 카드 전체를 상세 링크로 만들었다. 운영자 일정 카테고리·상태 그룹은 데스크톱 2열로 나란히 두고, 각 그룹의 제목은 선택지 위에 왼쪽 정렬한다.

## 2026-09-11 — Codex — PR33 학생 상세 UX와 피드백 단일 상태

- 기준: 최신 `origin/main` `1e07d7f34a7dfe65f46c2d102ee55d28c68a3a14`에서 `feat/student-detail-ux`를 생성했다. PR31·PR32 병합을 확인했으며 기존 migration은 수정하지 않았다.
- 데이터: 적용 직전 피드백 9건 중 정상 5건, 삭제 표시 4건이었고 정상 미게시 0건·삭제 미게시 1건이었다. 댓글은 삭제 표시 1건이었다. 사용자 승인에 따라 삭제 표시 피드백 4건과 댓글 1건만 즉시 물리 삭제하고, 이후 `deleted_at` 7일 경과 row를 매시간 정리하는 private pg_cron 함수를 적용했다. 학생·일정·배정·출결·프로그램·중단 이력 개수는 적용 전후 동일하다.
- 피드백: `published_at`과 게시 상태 query·필터·배지·문구를 제거했다. 학생 RLS는 본인 active assignment, 비-Draft 일정, 미삭제 피드백만 허용한다. 최근 4개 카드는 날짜와 오른쪽 상단 상세 버튼, 일정명, 한 줄 본문, 제공 직원·댓글 수로 단순화했다.
- 일정 배정: 학생 상세 패널을 체크박스 다중 선택으로 바꾸고 한 batch에 하나의 이용권을 사용한다. owner 전용 `assign_student_to_lessons` RPC가 학생 잠금, 전체 lesson·enrollment·중복·보강 충돌과 기존 quota/시간 충돌 정책을 한 transaction에서 검증하므로 부분 성공이 없다. staff/student/anon은 차단한다.
- 이용프로그램: 기본정보 편집과 별도 카드·action을 유지했다. 추가 후보를 compact 선택지로 정리하고, 남은 횟수·기본/조정·Draft·예약/사용·보강·조정 이력과 접이식 중단 form을 enrollment 카드 안으로 옮겼다. stopped enrollment와 과거 횟수·조정은 별도 이용 이력에 보존한다.
- 사용자 확인 반영: 일정 상세 피드백 modal의 기존 피드백을 본문이 채워진 편집 상자로 바꾸고 상자 안에 저장·삭제 control을 배치했다. 수정은 기존 owner/담당 staff 작성·제공 권한을 따르고 삭제는 owner만 soft-delete한다. 학생 상세 이용프로그램의 읽기 상태는 프로그램·기간·상태·남은 횟수만 표시하고 상세 횟수·조정은 수정 진입 뒤에만 보인다. 단일 이용권 일정 배정 panel은 목록 높이와 하단 여백을 줄이고 선택 수·이용권 안내·배정 버튼을 한 줄에 배치했다.
- 검증: batch RPC의 잠금 순서를 기존 일정 저장과 같은 lesson → student advisory lock으로 맞추는 append-only 교정 migration까지 적용해 local/remote 38개 migration이 일치한다. public/private DB lint는 기존 `delete_lesson_safely` 미사용 변수 경고 1건만 유지되고 cron lint는 깨끗하다. 합성 DB 38개 migration·116 assertions, ESLint, TypeScript, production build, diff check를 통과했다. 실제 owner/student 로그인, 역할 API와 보호 화면, 비인증 401 및 사용자 production 브라우저 확인을 완료했다.


작업 세션이 끝날 때마다 최신 항목을 맨 위에 추가한다.

목적은 다음 작업자나 다음 Codex 세션이 git log와 긴 대화를 처음부터 뒤지지 않고도 현재 상태를 이해하게 하는 것이다.

## 2026-09-10 — Codex — PR32 일정 상세 학생별 피드백 modal

- 한 일: 최신 PR31/PR30 포함 `origin/main`에서 일정 roster의 학생별 피드백 진입을 새 탭 route 대신 접근 가능한 modal로 전환하고, 일정 상세 하단의 기존 피드백 작성·수정·댓글 대시보드를 제거했다. modal 신규 피드백은 즉시 게시하며 저장 성공 뒤 열린 상태, textarea 초기화, 최상단 목록 반영을 유지한다.
- 조회: 같은 일정·학생의 미삭제 피드백 본문, 날짜, 실제 제공 직원, 게시 상태를 읽기 전용으로 표시한다. 댓글은 PostgREST 임베드 count로 삭제되지 않은 최상위 댓글과 답글 수만 한 번에 조회하고 본문·작성자·시각은 modal payload에 포함하지 않는다.
- 권한: staff는 로그인한 본인을 제공자로 사용하며 본인 담당 일정에서만 저장한다. owner는 해당 일정에 배정된 활성 담당 직원만 자동 선택 또는 선택할 수 있다. action은 lesson, active student assignment, 담당 staff, 제공자 관계를 다시 검증하며 기존 RLS를 그대로 사용한다.
- 데이터: migration/RLS/schema와 원격 DB·사용자 데이터는 변경하지 않았다. 학생 일정 상세·내 피드백의 댓글/답글 기능은 유지한다.
- 후속 UI: 사용자 확인 이미지를 반영해 학생 상세·전체 피드백 조회 dialog의 게시 배지와 metadata box, 수정 page 이동을 제거했다. 본문을 dialog 안에서 바로 수정하고 하단에는 `수정` 버튼 하나만 둔다. 본인이 작성한 댓글·답글에만 작은 수정·삭제 버튼을 표시하며 서버와 RLS가 `author_user_id` 소유권을 다시 확인하고 삭제는 soft-delete한다. 학생별 독립 수정 route는 제거했다.
- 학생 상세 정리: 학생정보와 이용프로그램을 각각 독립 카드로 분리했다. 학생정보 카드 오른쪽 위에는 `수정`·`삭제`, 이용프로그램 카드 오른쪽 위에는 `수정`을 배치하고 기존 카드 하단의 학생 삭제 영역은 제거했다. 두 편집 form과 저장 범위는 계속 독립적이다.
- 최종 리뷰 보정: 학생 상세·전체 피드백 dialog의 inline 본문 수정 UI를 서버 action 권한과 맞춰 owner 전체, 담당 일정의 본인 작성/제공 staff 피드백에만 표시한다. 사용자가 production UI 확인을 완료해 commit/push/PR/merge를 진행한다.

## 2026-09-09 — Codex — 일정 hard delete·Draft 목록 빠른 확정

- 한 일: 조건에 맞는 lesson을 원자적으로 제거하는 append-only migration, 실제 삭제 확인 dialog, 일정 목록 Draft 빠른 확정, 담당자·배정 학생 한 줄 레이아웃을 구현했다. 카드 배지는 확정 버튼과 같은 우측 영역에 정렬하고 세로 구분선은 제거했다.
- PR30 반영: PR30이 병합된 `355c481`을 fast-forward로 반영하고, 삭제·확정 검사를 서버 `requireOperatorAccess({ owner: true })`와 DB `private.is_owner()`에 연결했다. staff 화면에는 삭제·빠른 확정 UI를 렌더링하지 않는다.
- 데이터 보호: 출결은 안내 후 일정과 함께 삭제한다. 피드백·댓글과 취소되지 않은 보강은 구체적인 사유로 차단하며, 취소된 lesson에 취소 보강만 연결된 경우 보강 event와 보강 row를 함께 원자적으로 제거한다. 허용된 삭제는 active·soft-unassigned assignment와 담당자 관계도 제거하며 assignment 기반 예약·사용 횟수를 자연스럽게 반환한다.
- 검증: 합성 in-memory DB에서 35개 migration과 103개 assertion을 통과했다. owner 삭제·확정, staff 일정 조회와 삭제·확정 차단, student/anon 차단, 상태별 삭제, 출결 동반 삭제, 취소된 보강 대체 일정과 보강·event 정리, 원 일정·출결 보존, 피드백/활성 보강 차단 사유, rollback, 예약·사용 횟수 반환을 포함한다. ESLint, TypeScript, 인증 경계 7개 테스트, production build, diff check를 통과했고 실제 owner/student 로그인·역할 API·보호 화면과 비인증 401을 확인했다.
- 원격 확인: PR30까지 local/remote 34개 migration이 일치하고 PR29 migration 한 건만 local-only인 상태에서 `db push --dry-run` 대상이 해당 파일 하나뿐임을 확인한 뒤 append-only migration을 적용했다. 적용 후 local/remote 35개 이력이 일치하고 public/private/extensions DB lint는 오류 없이 통과했다. 잠금 확인용 변수의 미사용 경고 1건은 데이터·권한 동작과 무관하며 적용된 migration은 수정하지 않았다.
- 원격 권한 smoke test: 실제 `테스트 일정 1`은 호출하지 않고 존재하지 않는 UUID만 사용했다. owner의 삭제·Draft 확정은 대상 조회 단계의 P0002까지 도달했고 staff/student/anon은 두 RPC 모두 42501로 차단됐다. 사용자 일정 row mutation은 실행하지 않았다.
- 현재 상태: 최종 변경과 원격 적용·검증을 마쳤으며 commit/push/PR/merge를 진행한다.

## 2026-09-08 — Codex — PR27 학생별 피드백 조회·그룹레슨 작성 UX

- 한 일: 운영자 학생 상세에 최근 피드백 4건, 조회 전용 상세 dialog, KST 기간·정렬·게시 상태를 URL로 유지하는 학생별 전체 피드백 화면을 추가했다.
- UI 확인 반영: 학생 상세와 전체 목록의 피드백 요약 카드에는 직원 이름만 표시하고 역할은 생략한다. 상세 dialog와 작성 화면의 직원 선택에는 역할을 유지한다.
- 한 일: 일정의 active 학생마다 새 탭 피드백 작성 링크를 제공하고, 학생·일정 조합별 작성/수정/삭제/댓글 화면과 저장 시각 안내를 추가했다.
- 확인된 것: 기존 다중 `lesson_feedback`, `feedback_comments`, operator RLS, assignment 복합 FK로 구현 가능해 migration/RPC를 추가하지 않았다. 모든 operator 피드백 mutation은 active assignment와 feedback의 lesson/student 조합을 서버에서 재검증하고 관련 operator/student 6개 경로를 revalidate한다.
- 병렬 작업: PR26 작업 폴더와 `20260908000000_pr26_makeup_manual_completion.sql`은 변경하지 않았고, `origin/main`의 PR25 merge commit `9b22a18`에서 별도 `feat/operator-student-feedback` worktree를 만들었다.
- 동기화: PR26 병합 뒤 `origin/main`의 merge commit `6670b54`로 fast-forward하고 PR27 변경을 다시 적용했다. 기능 코드 충돌은 없었고 공통 문서 3개도 자동 병합 뒤 의미와 충돌 표식을 확인했다.
- 검증: PR26 동기화 후 TypeScript, ESLint, Supabase 공개 환경변수를 포함한 production build와 `git diff --check`를 통과했다. 두 신규 동적 route의 build 출력을 확인했고 별도 production 서버에서 비인증 접근이 운영자 로그인으로 307 redirect되는 것을 확인했다.
- 사용자 확인: production 브라우저에서 실제 피드백 데이터 조회·저장, dialog와 모바일 동작을 확인했고, 확인 결과를 반영해 피드백 요약 카드의 직원 역할 표시를 제거했다. 기존 연결 정보의 DB 비밀번호 인증 실패로 최신 원격 migration 목록과 read-only RLS 실계정 회귀는 별도로 재확인하지 못했다.
- 제한: 같은 feedback을 여러 탭에서 동시에 수정하면 마지막 저장이 앞선 저장을 덮어쓸 수 있는 기존 last-write-wins 동작을 유지한다. 동시 편집 잠금은 이번 범위에 추가하지 않았다.

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

## 2026-09-09 — Codex — PR28 일정관리 목록 정보·필터 개선

- 한 일: 최신 `origin/main` 기준 `feat/schedule-list-polish` 브랜치에서 홈 첫 화면과 운영자·학생 로그인 화면의 DEMO 안내 박스를 제거했다. 운영자 일정 카드에 기존 `lesson_staff` 담당자 이름과 활성 `lesson_assignments` 학생 이름을 표시하고, 학생이 4명 이상이면 앞 3명과 `외 N명`으로 요약한다. 카테고리·상태 버튼은 줄바꿈 가능한 한 줄 흐름으로 바꾸고 월/담당자/정렬 컨트롤을 같은 3열 계열로 정리했다.
- 확인된 것: 담당자 선택지는 active `staff_profiles`만 사용하고 `staff` URL query로 새로고침 상태를 유지한다. 카드 담당자 표시는 보관 직원과 연결된 과거 관계도 유지하며, 학생은 `unassigned_at is null`인 배정만 포함한다. migration, RLS, Supabase 데이터와 Auth 사용자는 변경하지 않았다.
- 검증: 작업 tree 대상 전체 ESLint(`.worktrees/**` 제외), `tsc --noEmit --incremental false`, production build, `git diff --check`를 통과했다. 실제 Supabase 연결 production 서버에서 operator/student 로그인과 보호 화면 HTTP 200, 비인증 역할 요청 401을 확인했고, 사용자가 운영자 일정 카드·필터·모바일 레이아웃과 DEMO 문구 제거를 브라우저에서 확인했다. 원형 `npm run lint`는 저장소 내부 기존 `.worktrees/**/.next` 산출물을 검사하는 알려진 문제로 실패했다.

## 2026-09-08 — Codex — PR26 보강 완료 정책 정정

- 한 일: 대체 일정 출결 완료와 일정 없이 수동 완료를 모두 기존 `completed` 상태와 완료 목록에 함께 표시하도록 구현했다. append-only migration으로 `makeup_lessons.completion_method`, 수동 완료 처리자/시각/메모 컬럼, `complete_makeup_without_schedule`, `restore_manual_makeup_completion` RPC를 추가했다. 완료·복구 시점의 완료 경로와 메모는 별도의 `makeup_lesson_events` row에도 저장한다.
- 확인된 것: 수동 완료는 replacement lesson/attendance/assignment 없이 requested row를 completed로 바꾸고, 복구는 같은 row의 현재 완료 필드를 비운 뒤 requested로 되돌린다. 과거 처리자·시각·메모는 append-only event에 남으므로 이후 대체 일정으로 자동 완료되어도 서로 섞이지 않는다. 대체 일정 출결 완료는 `completion_method = replacement_attendance`로 판정하며 복구 버튼을 노출하지 않는다.
- 검증: 대상 ESLint, TypeScript, production build, `git diff --check`를 통과했다. PGlite에 기존 migration을 포함한 33개를 순서대로 적용하고, 수동 완료·동일 row 복구·자동 완료 복구 차단·이력 보존·학생 호출 차단을 포함한 50개 회귀 검증을 통과했다. 같은 정책의 PR26 pgTAP SQL도 추가했다. 전체 lint는 `.worktrees/**/.next` 생성물을 함께 검사하는 기존 설정 때문에 실패했다.
- 원격 확인: `codex/pr26-makeup-completion-policy` 브랜치를 push하고 PR #26을 생성했다. 원격 32개 migration과 로컬 기존 이력이 일치하고 PR26 하나만 local-only인 것을 확인했다. 원격 적용 dry-run은 PR26 파일 하나만 표시했고 현재 원격 public/private/extensions schema DB lint는 오류가 없었다.
- 환경 판정: `.env.local`과 Supabase CLI가 같은 project ref를 가리키며 해당 프로젝트의 database branch 목록은 비어 있다. 별도 staging DB가 없는 primary DB로 취급한다. Vercel Preview도 이 DB를 사용할 수 있으므로 테스트 학생이 아닌 실제 데이터로 완료·복구를 확인하지 않는다.
- 다음 할 일 / 막힌 것: PR 병합 후 primary Supabase에 migration을 적용하고 실제 operator/student 세션 RLS를 검증해야 한다.

## 2026-09-07 — Codex — PR25 일정관리 목록 필터·정렬 UX

- 한 일: 최신 `origin/main` 기준 `feat/schedule-list-filters` 브랜치에서 운영자 일정관리 목록의 카테고리와 상태를 개수 포함 다중 선택 버튼으로 정리했다. 월과 `sort=asc|desc` 정렬은 선택 즉시 적용되며, 제목 검색과 별도 적용 버튼은 제거했다.
- 확인된 것: 같은 필터 그룹의 선택값은 OR, 카테고리와 상태 사이는 AND로 적용하며 반복 query로 선택을 유지한다. 카테고리 개수는 현재 상태·월 범위, 상태 개수는 현재 카테고리·월 범위로 계산한다. 정렬은 DB 조회 order 단계에서 `starts_at`, `ends_at`, `id` 순으로 적용하며 필터 개수에는 영향을 주지 않는다. DB schema, migration, RLS, 사용자 데이터는 변경하지 않았다.
- 검증: TypeScript, 작업 tree 기준 ESLint, production build 통과. 로컬 `.worktrees/`의 기존 병렬 worktree 빌드 산출물 때문에 `npm run lint` 원형 명령은 해당 보관 폴더까지 훑어 실패해, `.worktrees/**`만 제외한 ESLint로 실제 작업 tree를 검증했다.

## 2026-09-04 — Codex — PR #23 Final Review 및 병합 승인

- 한 일: 사용자 UI 확인과 커밋·푸시·병합 승인을 받았다. 최신 origin/main `b95ac71` 포함 여부와 전체 변경을 최종 리뷰했다. GitHub PR은 아직 없어 push 후 생성하며 일반 merge로 마무리한다.
- 확인된 것: 직전 최종 코드의 production build/TypeScript, ESLint, 보강 조건 렌더링 4건 검증 결과를 유지한다. 학생 본인 active assignment, Draft 차단, 게시·미삭제 필터, 최소 작성자 RPC 반환값 및 세 화면 revalidation 경로를 재확인했다. migration 31건의 local/remote 일치를 재확인했다.
- 제한: 실데이터 부재로 자동 댓글 저장·작성자 표시 양성 E2E는 검증하지 않았다. 아카이브는 일정·피드백 200건, 댓글 1,000건 조회 상한이 있으며 pagination을 후속으로 남긴다. 사용자 확인을 자동 E2E 통과로 간주하지 않는다.

## 2026-09-04 — Codex — 학생 이용권 보강 수치 조건부 표시

- 한 일: 학생 내 일정의 이용권 카드에서 보강 대기·예정 중 하나라도 0보다 클 때만 보강 줄을 표시한다. 생성 전과 완료·취소 후 두 수치가 모두 0이면 숨기며, 보강의 `예약` 라벨을 `예정`으로 구분했다.
- 범위: 기존 본인 집계 RPC를 그대로 사용한다. DB/RLS/migration과 일반 이용 횟수 계산은 변경하지 않았다.
- 확인된 것: 실제 JSX의 0/0·1/0·0/1·1/1 렌더링 조건 4건, 해당 파일 ESLint, production build/TypeScript, `git diff --check` 통과. 직접 확인용 production 빌드를 갱신했다.

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

## 2026-09-04 — Codex — PR #23 migration 충돌 해소·원격 적용

- 한 일: 사용자 승인에 따라 PR22에서 원격 적용한 migration 5개를 원본 그대로 이 worktree에 반영했다. 원본과 개행 정규화 후 내용 일치를 확인했다. PR22 코드 전체는 가져오지 않았다.
- 한 일: 원격 후속 적용을 재확인하여 PR23 미적용 migration을 `20260904020000_add_student_feedback_author_lookup.sql`로 변경했다. SQL 내용 해시는 변경 전과 동일하다. dry-run에서 이 파일 한 건만 적용됨을 확인한 후 원격 적용했다.
- 한 일: PR22가 제거한 `lessons.program_type` 대신 학생 본인의 active assignment에 연결된 `student_programs.program_type`으로 PR23 상세·아카이브의 이용권 라벨을 조회하도록 호환성을 수정했다.
- 확인된 것: local/remote migration 31개 일치, public/private DB lint 통과. 신규 RPC 반환값은 피드백 ID·표시 이름·역할 또는 댓글 ID·표시 이름만 포함한다. search_path 고정, authenticated만 EXECUTE, anon/service_role 실행 권한 없음.
- 확인된 것: 기존 계정의 read-only RLS 검증과 신규 RPC의 알 수 없는 ID·NULL·초과 입력 비노출 검증 통과. 사용자/피드백/댓글 데이터는 생성하거나 수정하지 않았다. 게시 피드백·댓글 실데이터가 없어 양성 렌더링 및 댓글 저장 E2E는 미검증이다.
- 추가 반영: 작업 중 PR22가 main에 병합되어 `b95ac7151c943f8d33fd96429a65c7d592035331`로 fast-forward했다. PR22 이용권 표시·인증 수정과 PR23 상세 Link를 함께 보존했으며 운영 화면 코드도 main 원본으로 통합됐다.
- 확인된 것: 최종 ESLint, `tsc --noEmit --incremental false`, production build/TypeScript, `git diff --check` 통과. 공개 Supabase 설정을 프로세스에만 전달해 127.0.0.1:3200 production 서버를 재시작했다. commit/push/PR/merge 없이 변경과 원본 보존 stash를 유지한다.

## 2026-09-04 — Codex — PR #23 main 반영·원격 검증 중단 지점

- 한 일: 기존 PR23 미커밋 변경을 stash로 보존하고 `5554672055f1fa96ab94a28565edc6c1de7ffb1e`로 fast-forward했다. 개발 기록 충돌은 PR21·PR23 내용을 모두 보존했으며 변경은 unstaged 상태로 복원했다.
- 확인된 것: PR23 신규 migration 내용은 원본 해시와 동일하다. 원격 `20260902000000`은 PR23이 아닌 `neutral_lessons_and_allowances`이며 `20260902010000`, `20260902020000`도 원격에만 존재한다. PR23 작성자 RPC 두 개는 원격에 없다.
- 막힌 것: migration 버전 충돌 및 local/remote 이력 불일치로 하네스 규칙에 따라 DB 적용·이력 repair를 중단했다. 원격 선적용 migration 원본 반영과 PR23 미적용 migration 버전 변경에 대한 별도 판단이 필요하다.
- 확인된 것: 원격 public/private DB lint 통과. read-only transaction으로 학생 10계정의 본인 일정·출결·피드백/댓글 접근과 Draft 차단, 운영자 일정 SELECT를 검증했다. 현재 게시 피드백과 댓글은 0건이므로 작성자 표시·댓글 작성 end-to-end 검증은 남아 있다. 애플리케이션 데이터는 변경하지 않았다.
- 확인된 것: 최신 main 기준 production build와 TypeScript 검사 통과. localhost 3200 production 서버의 학생 로그인 HTTP 200, 비인증 일정 HTTP 307 확인. migration 적용 전이므로 피드백이 생기면 신규 RPC 호출은 실패할 수 있다.

## 2026-09-02 — Codex — PR #21 운영 화면 UX 개선

- 한 일: 학생 신규 등록의 현재 입력 비밀번호를 포인터 또는 키보드로 누르는 동안만 표시하고, release/leave/cancel/blur에서 즉시 숨기는 접근 가능한 보기 버튼을 추가했다.
- 한 일: 일정관리 목록에 전체·예정·완료·Draft·취소 URL query 필터와 display status 기준 count/빈 상태를 추가하고, 일정 상세에 보조 계층의 새 일정 등록 링크를 추가했다.
- 한 일: 직원 저장/삭제를 독립 form 상태로 한 줄 배치하고, 보강 원수업 정보 sub-card 전체를 일정 상세 링크로 만들었다.
- 확인된 것: DB schema, migration, RPC, RLS, 데이터 query 및 mutation action은 변경하지 않았으며 ESLint, TypeScript, production build를 통과했다.
- 다음 할 일: production UI에서 포인터·키보드 비밀번호 보기, 일정 필터/빈 상태, 직원 버튼, 원수업 링크를 사용자 확인한다.

## 2026-09-02 — Codex — PR #23 학생 일정 상세·피드백 탐색

- 한 일: 학생 내 일정 카드를 상세 Link로 연결하고, 본인 active assignment의 비-Draft 일정에서 일정·담당 직원·본인 출결·게시 피드백·댓글/답글을 한 흐름으로 확인하도록 구현했다.
- 한 일: 내 피드백을 lesson KST 날짜 기반 전체/최근 1·3·6개월/직접 기간과 최신·오래된 수업순 URL 필터를 지원하는 공식 피드백 카드 아카이브로 정리했다.
- 한 일: 실제 피드백 제공자 이름·역할과 댓글 작성자 표시 이름만 반환하는 제한형 RPC를 append-only migration으로 추가했다. 직원 전체 목록, 직원 ID, `auth_user_id`는 조회 결과에 포함하지 않는다.
- 확인된 것: 기존 RLS가 타 학생, Draft, 미게시·삭제 피드백과 접근 불가 댓글을 차단하며 댓글 parent의 같은 feedback 복합 FK와 기존 작성 action을 재사용한다. 학생에게 숨겨진 soft-delete parent는 노출 가능한 답글 앞에 안전한 placeholder로 표시한다.
- 확인된 것: ESLint, TypeScript, production build, `git diff --check`와 KST 기간 경계·invalid query 검사를 통과했다. 별도 worktree에 DB 환경과 Supabase CLI가 없어 migration 적용 및 실제 student/operator 세션 RLS 검증은 수행하지 않았고 사용자 데이터도 변경하지 않았다.

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

## 2026-09-04 — PR24 운영 UX와 일정 카테고리

- 기준: PR22 b95ac71, PR23 13f1365 병합 확인. 기존 main checkout과 취소된 조사 worktree를 보존하고 .worktrees/operator-ux의 feat/operator-ux-and-schedule-categories에서 구현했다. 취소된 배정 오류 조사는 하지 않았다.
- 구현: 일정 운영 카테고리 선택·미분류·배지·category/status/month/q 필터, 기본정보/프로그램 독립 form과 전용 RPC, Draft 취소 버튼 숨김. 기존 새 일정 링크를 유지하고 비밀번호 보기 상태/창 blur/모바일 경계 이탈 처리를 보완했다. 같은 Supabase를 쓰는 Vercel 전환을 위해 기존 RPC 함수는 호환 경로로 유지하고 새 코드 참조만 제거했다. Migration 미적용 상태의 42703에 한해서 일정 목록·상세가 기존 컬럼으로 재조회되어 미분류로 열리도록 호환했다.
- 데이터 보호: 신규 migration 20260904030000 하나만 추가. 기존 일정 NULL 유지, backfill 없음. 일정 metadata-only 저장은 배정·출결·보강·quota를 수정하지 않으며 프로그램 변경 묶음은 transaction을 유지한다. Auth 이메일 변경과 실패 복구는 기본정보 action에 유지한다.
- 검증: ESLint, tsc --noEmit --incremental false, production build, diff check 통과. 원격 기존 schema DB lint 무경고. PGlite의 가상 Auth/role bootstrap과 합성 데이터로 기존 31개+신규 1개 migration 전체 실행, 34개 회귀 검증 통과. SQL 조건식 문법 오류를 로컬 실행에서 발견·수정했다.
- 원격 적용: 2026-09-07 사용자 승인 후 dry-run에서 신규 migration 한 건만 확인하고 적용했다. 적용 후 local/remote 32개 일치, DB lint 무경고, nullable 컬럼·CHECK·INSERT trigger·구/신 RPC 병존을 읽기 전용으로 확인했다. 기존 일정 12건은 모두 NULL(미분류)로 유지했으며 사용자 row mutation, backfill, seed, history repair는 실행하지 않았다.
- 한계: 실제 Auth 이메일 변경/복구와 migration 적용 후 브라우저·모바일 입력, 동시 두 DB 세션은 미실행이다. 기존 pgTAP/동시성 fixture의 새 카테고리 입력만 갱신했고 해당 테스트 파일 전체는 실행하지 않았다.
- 다음: 사용자가 migration 적용 후 브라우저 흐름을 확인한다. commit/push/PR/merge 없음.

## 2026-09-09 — Codex — PR30 직원 운영계정·owner/staff 권한 분리

- 사전 조사: 최신 `origin/main`과 clean main, local/remote migration 33개 일치를 확인했다. 실제 Auth는 operator 1명·student 12명·예상 밖 role 0명·중지 계정 0명이었고, 직원 프로필 2명은 모두 Auth 미연결·active였다. 중복 이름, 중복/끊어진 연결, inactive 연결은 없었다. 이메일·UUID·secret은 출력하지 않았다.
- 구현: 별도 `feat/staff-accounts` worktree에서 `operator_accounts`를 접근 권한 source of truth로 추가하고 기존 유일 operator를 owner로 bootstrap했다. 직원 아이디는 별도 내부 도메인으로 결정 변환하며 신규·기존 직원 계정 생성, 초기 비밀번호, 재설정, 중지·재활성화, 보관·복원의 Auth/DB 보상 흐름을 owner 전용으로 구현했다.
- 권한: 기존 `is_operator()` mutation 의미를 owner로 좁히고 active operator SELECT, 담당 staff의 출결·본인 피드백·댓글 mutation 정책을 분리했다. proxy/layout/server action/RPC/RLS가 로그인 중지와 inactive 직원의 기존 세션을 재확인한다. owner/staff는 공통 `/operator/*` UI를 사용하며 staff에게 관리 버튼과 로그인 아이디·계정 상태를 숨긴다.
- 검증: append-only migration 34개를 PGlite에 순서대로 적용하고 owner/staff/disabled staff/student/anon 및 담당·미담당 경계를 포함한 합성 데이터 60개 assertion을 통과했다. Auth outage/session/disabled-account 경계 테스트 7건, ESLint, TypeScript를 통과했다. 자동 회귀 검증 단계에서는 실제 업무 Auth 생성·비밀번호 변경·ban과 사용자 데이터 mutation을 수행하지 않았다.
- 최종 확인: ESLint, `tsc --noEmit --incremental false`, production build, `git diff --check`를 통과했다. 적용 직전 원격 33개 migration과 단일 dry-run 대상을 재확인한 뒤 사용자 승인으로 `20260908230000_add_staff_operator_accounts.sql`만 적용했다. 적용 후 local/remote 34개 이력 일치, public/private/extensions DB lint 무경고다. 기존 owner 이메일 로그인·owner context·운영 일정 HTTP 200과 기존 학생 로그인·학생 일정 HTTP 200, 비인증 role 요청 401을 production 서버에서 확인했다. 일정 hard delete·Draft 빠른 확정 branch는 수정하거나 병합하지 않았다.
- 브라우저 검증 환경 보완: 별도 worktree의 production build에 Git 제외 파일인 `.env.local`이 없어 브라우저 번들에 공개 Supabase 설정이 포함되지 않았고, 로그인 폼이 네트워크 요청 전에 `일시적인 오류`를 표시했다. 원본 checkout의 환경변수를 값 출력 없이 build와 start 프로세스 모두에 전달해 재빌드했다. 합성된 존재하지 않는 계정이 `입력한 계정 정보가 올바르지 않습니다`로 응답하는 것과 실제 테스트 owner/student 로그인·역할 API·보호 화면 200을 확인했다. 재발 방지 절차는 `docs/class-log-harness/SKILL.md`와 README에 기록했다.
- 사용자 브라우저 확인: 실제 staff 계정 생성·로그인·로그인 중지 흐름을 사용자가 확인했다. PR30의 브라우저 확인 항목을 완료 처리했으며 비밀번호나 공개 환경변수 값은 기록하지 않았다.

## 2026-09-11 — Codex — 로그인 회귀 검증 완료 조건 강화

- 원인 교정: 브라우저 직접 Auth 호출과 별도 역할 요청을 서버 로그인 액션으로 통합하고, 로그인 직후 역할 판별은 해당 요청에서 발급된 access token을 사용하도록 변경했다.
- 자동 검증: `npm run verify:login`을 추가해 production build의 실제 운영자·학생 로그인 서버 액션 200, 역할별 목적지, 인증 쿠키, 역할 API와 보호 화면 200, 비인증 401을 한 번에 검사한다.
- 재발 방지: 로그인/Auth/쿠키/공개 환경변수/proxy/보호 layout 변경은 위 검증 통과 전 완료로 판단하거나 보고하지 않도록 하네스와 Git workflow에 필수 조건으로 기록했다. 직접 Supabase 로그인이나 한 역할만의 성공으로 대체할 수 없다.
- 확인: 3100 포트의 최신 production 서버에서 새 표준 명령을 실행해 전체 조건을 통과했다. 비밀번호·토큰 출력 및 사용자 데이터 mutation은 없었다.
