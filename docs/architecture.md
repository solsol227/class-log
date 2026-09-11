# Class Log 아키텍처

이 문서는 Class Log의 현재 데이터 모델과 기술적 불변조건의 원본이다.
제품 요구사항은 `docs/product-plan.md`, 설계 판단 이유는 `docs/decisions.md`를 따른다.

## 현재 기준

- 구현 브랜치: `feat/student-program-management`
- 기준 main commit: `d8c01137855a37f7523ee54501df4336fd80152e`
- PR #19 사유결석 기반 보강 merge 완료
- local/remote migration: 25개 일치
- 이번 작업 신규 migration: `20260901040000_add_atomic_student_program_management.sql`

## 1. 학생

`students.id`와 `auth_user_id`는 분리 유지한다.
`nickname`은 로그인 식별자이자 화면 표시 이름이다.

현재 핵심 필드:
- `id`
- `auth_user_id`
- `nickname`
- `gender`
- `age integer` (1~119)
- `phone`
- `acquisition_source`
- `joined_month`
- `special_notes`
- timestamps

제거 완료:
- `display_name`
- `category`

유입경로 허용값:
- `instagram`
- `daangn`
- `referral`
- `naver`

## 2. 학생 프로그램

`student_programs`가 프로그램 이용 이력을 관리한다.

프로그램:
- `weekday_vocal`
- `weekend_vocal`
- `rental`
- `trial`

기본 제공량은 `base_allowance_count`에 저장한다.

- weekday/weekend: KST 월별 4회
- trial: enrollment 전체 1회
- rental: enrollment 등록 시 설정한 전체 횟수

추가·정정은 `student_program_allowance_adjustments` append-only ledger에 저장한다. 일반 이용 횟수는 별도 차감 row를 만들지 않고 확정 lesson의 active assignment에서 계산한다.

저장 상태:
- `active`
- `stopped`

중단 사유:
- `break`
- `ended`
- `other`

같은 학생+프로그램의 active enrollment는 동시에 한 건만 허용한다.
`inactive`는 저장하지 않고 `student_program_statuses` view에서 계산한다.

PR24에서는 `save_student_profile`과 `save_student_programs` RPC로 저장 범위를 분리한다. 전자는 students 기본정보만, 후자는 프로그램 변경 묶음만 갱신한다. 기존 통합 RPC는 Vercel 전환 호환을 위해 이번 migration에서는 유지하되 새 코드 참조는 제거하며, production 배포 확인 뒤 후속 migration에서 제거한다. 두 신규 RPC는 SECURITY INVOKER이며 operator 검증과 기존 RLS를 따른다.

- active 중단: 기존 row를 `stopped`로 바꾸고 중단일·사유를 기록한다.
- 이용 재개: stopped row를 되살리지 않고 새 active row를 만든다.
- stopped 사유 수정: 기존 history row의 사유만 수정한다.
- 미래 활성 일정 배정이 있는 enrollment는 중단할 수 없다.
- 프로그램 변경 묶음 중 하나라도 실패하면 프로그램 변경 전체를 rollback한다. 기본정보와 Auth 이메일 변경·실패 시 복구는 기본정보 action에만 남긴다.
- 각 편집 form의 저장·취소·미저장 상태를 분리하며 다른 영역 저장의 revalidation으로 편집 중 프로그램 snapshot을 교체하지 않는다.
- 학생 기본정보와 이용프로그램 편집은 계속 별도 카드·action으로 유지한다. 이용 횟수 현황·조정·이력은 이용프로그램 편집의 해당 enrollment 카드 안에 표시하고 별도 읽기 전용 대시보드는 두지 않는다.

학생 목록 상태와 이용프로그램 필터는 저장 컬럼을 추가하지 않고 enrollment/view로 계산한다.

- 진행중 탭: 저장 상태가 active인 enrollment가 하나 이상인 모든 학생
- 진행중 배지: active enrollment 중 effective active가 하나 이상
- 장기 미배정 배지: active enrollment는 있으나 모두 effective inactive. 별도 상태 탭으로 분리하지 않는다.
- 휴식: active enrollment가 없고 가장 최근 stopped 이용기간 중 사유가 `break`
- 이용종료: active enrollment가 없고 가장 최근 stopped 이용기간이 `ended` 또는 `other`. 프로그램 이력이 없는 학생도 목록에서 누락되지 않도록 이 탭에 포함하되 `프로그램 미등록` 배지를 표시한다.
- 프로그램 필터: active enrollment가 있으면 현재 active 프로그램, 없으면 가장 최근 stopped 이용기간의 프로그램을 기준으로 판정한다.
- 검색어·상태·프로그램 필터는 URL query로 함께 유지한다.

## 3. 일정

lesson은 이용권 프로그램 구분이 없는 중립 일정이다. `lessons.program_type`은 제거되었다.

PR24 신규 nullable `lessons.schedule_category`는 `weekday | weekend | trial` 운영 분류만 저장한다. 기존 NULL은 미분류이며 backfill하지 않는다. 신규 INSERT에만 분류 필수를 검사한다. 카테고리는 배정·일반 quota·보강권 계산에 참여하지 않는다.

일정 저장 RPC는 `lesson_category`를 명시적으로 받는다(NULL 포함). 시간·상태·배정 이용권 집합이 현재 row와 같으면 lesson row lock 아래 제목·장소·메모·분류만 수정해 배정과 출결·보강·quota를 그대로 보존한다. 목록은 category/status/month/staff/sort query를 조합하며, 담당자 필터는 active 직원과 `lesson_staff` 관계를 기준으로 적용한다.

PR24 migration은 2026-09-07 사용자 승인 후 원격에 적용했다. 기존 일정 12건은 NULL(미분류)로 유지했고 local/remote migration 32개가 일치한다.

`lessons.status`:
- `draft`
- `scheduled`
- `completed`
- `cancelled`

Draft:
- 운영자에게 보임
- 학생에게 안 보임
- 시간 충돌 검사에는 포함

DB `lessons.status`와 화면 표시 상태는 같은 의미를 사용한다.
- `draft`: 미확정 일정
- `cancelled`: 취소 일정
- `scheduled`: 확정 일정이며 `ends_at > now()`
- `completed`: 확정 일정이며 `ends_at <= now()`

일정 생성·수정 RPC는 클라이언트의 `completed` 입력을 받지 않고 DB 시간으로 상태를 계산한다.
운영자 화면은 실제 조회한 lesson ID만 공통 RPC에 전달해, 종료된 `scheduled` row를 idempotent하게 `completed`로 동기화한다.
학생 화면은 DB를 변경하지 않으며, 동기화 전 stale row에도 올바른 상태를 보이도록 시간 기준 display fallback을 유지한다.

## 4. lesson_assignments

복합 PK `(lesson_id, student_id)`와 soft-unassign 구조를 유지한다.

핵심 필드:
- `lesson_id`
- `student_id`
- `student_program_id`
- `assigned_at`
- `assigned_by`
- `unassigned_at`

재배정 시 기존 row를 재활성화하며 `assigned_at`의 최초 의미를 보존한다.
`student_program_id`는 이 학생의 해당 일정 참여가 사용하는 이용권이다. 같은 lesson의 학생들이 서로 다른 프로그램 이용권을 사용할 수 있으며 `assignment_purpose`는 두지 않는다.

학생 상세의 다중 배정은 `assign_student_to_lessons(uuid[], uuid, uuid)` 한 번으로 처리한다. owner 권한, 학생·active enrollment, 전체 lesson 집합, 중복·기존 active assignment·보강 충돌을 같은 transaction에서 검증하고 학생 advisory lock과 기존 quota/충돌 trigger를 재사용한다. 한 batch는 하나의 enrollment만 사용하며 하나라도 실패하면 전체 rollback한다.

Draft assignment는 quota에 포함하지 않는다. Scheduled/Completed assignment는 quota에 포함하며, 시작 전이고 attendance/feedback이 없을 때만 soft-unassign으로 반환할 수 있다. 보강 replacement는 일반 quota가 아니라 연결된 독립 보강권을 사용한다.

## 5. 시간 충돌

겹침 조건:

```text
existing.starts_at < new_ends_at
AND existing.ends_at > new_starts_at
```

따라서 `17:00~18:00`과 `18:00~19:00`은 허용한다.

구현:
- 학생별 advisory lock
- overlap helper
- assignment trigger
- lesson 변경 trigger
- RPC 내부 deterministic lock

중요:
시간 변경과 학생 제거를 동시에 하면, 최종 선택에서 빠질 학생은 lesson 시간 변경 전에 soft-unassign한다.
최종적으로 남는 학생만 overlap 검사를 받아야 한다.

## 6. 일정 RPC

### `save_lesson_with_assignments`
lesson과 배정을 한 transaction으로 저장한다.

입력은 학생 ID가 아니라 선택한 `student_program_id[]`다. DB가 각 enrollment의 학생을 확인하고 같은 학생이 한 lesson에서 두 이용권을 사용하지 못하게 한다.

### `confirm_draft_lesson`
Draft를 scheduled로 확정한다.

다중 학생의 advisory lock은 `save_lesson_with_assignments`와 동일하게 학생 UUID 순서로 획득한다. enrollment UUID 순서와 섞으면 확정/저장 동시 요청이 deadlock을 만들 수 있다.

### `assign_student_to_lesson`
학생 상세에서 한 명을 추가 배정하는 전용 RPC다. lesson row를 잠근 뒤 해당 학생의 배정만 추가/복구하고 다른 배정과 일정 필드는 유지한다. 클라이언트가 읽은 전체 명단을 재저장하지 않는다.

학생 이용권 RPC는 본인 집계만 반환하며 Draft 개수는 0으로 숨기고 Draft만으로 생긴 월도 제외한다. 운영자 집계에는 Draft가 유지된다.

### `delete_lesson_safely`

피드백·댓글과 취소되지 않은 보강 관계가 없는 lesson을 상태와 무관하게 hard delete한다. 출결은 삭제 대상이며, 대상 lesson이 취소 상태이고 관련 보강도 모두 취소 상태이면 해당 보강 event와 보강 row도 함께 삭제한다. lesson, assignment, student program, 출결, 피드백과 보강 관계를 잠근 뒤 조건을 transaction 안에서 재검사하고 허용된 관계만 원자적으로 제거한다. 별도 allowance adjustment를 만들지 않으며 일반 이용권 집계는 삭제된 확정 assignment를 자동으로 제외한다.

직접 assignment/attendance/makeup/lesson DELETE는 guard가 차단한다. RPC가 사용하는 예외는 authenticated caller가 만들 수 없는 `private.lesson_delete_capabilities`의 transaction·lesson·actor와 허용된 makeup ID 조합으로 제한한다. 피드백·댓글과 활성/완료 보강은 서로 다른 SQLSTATE로 거부해 UI가 실제 차단 사유를 안내한다.

PR30 병합 후 삭제와 Draft 확정은 서버의 `requireOperatorAccess({ owner: true })`와 DB의 `private.is_owner()`를 공통 권한 경계로 사용한다. owner만 두 mutation을 실행할 수 있고 staff는 일정 조회만 가능하며, student와 anon은 모두 차단한다.

## 7. 직원

`staff_profiles`:
- `manager`
- `vocal_trainer`
- `auth_user_id` nullable

`lesson_staff`로 한 일정에 여러 담당자를 연결한다.

담당자 교체는 `replace_lesson_staff` RPC에서 원자 처리한다.
성공 시 일정 상세에 `담당직원이 저장되었습니다.`를 표시한다.

직원 삭제는 `delete_or_archive_staff` RPC에서 항상 `is_active = false`로 보관한다.
- 참조 유무와 관계없이 직원 profile을 hard delete하지 않는다.
- 실수 삭제를 복원할 수 있고 미래 직원 활동 대시보드의 기록 일관성을 유지한다.
- Auth 사용자는 삭제하거나 변경하지 않는다.

보관된 직원은 `restore_staff_profile`로 복원한다. 일반 직원 화면에서는 별도의 활성/비활성 토글을 노출하지 않는다.

`/operator/staff/[staffId]`에서 직원 정보, 당시 역할을 포함한 담당 일정, 삭제되지 않은 피드백 이력을 조회한다. 보관 직원의 상세와 과거 기록도 유지한다.

`replace_lesson_staff`는 차등 갱신한다.
- 선택 해제된 관계만 삭제한다.
- 기존 관계는 직원이 보관 상태여도 유지한다.
- 새 관계는 활성 직원만 추가한다.
- 기존 `lesson_staff.role`은 직원 profile의 role 변경과 무관하게 당시 역할 기록으로 유지한다.

## 8. 피드백

`lesson_feedback`:
- 같은 lesson+student에 여러 건 허용
- `author_staff_id`: 실제 피드백 제공자
- `created_by`: 시스템 입력자
- `deleted_at`

`feedback_comments`:
- 댓글/답글 thread
- parent는 같은 feedback 안에서만 연결
- soft-delete
- `author_user_id`를 학생 `auth_user_id` 또는 직원 `auth_user_id`와 연결해 작성자 이름을 표시
- 직원 profile에 연결되지 않은 운영 계정은 `운영자`로 표시

기존 `feedback_responses`는 제거 완료했다.

피드백은 작성 즉시 학생에게 보이는 단일 상태다. 학생은 active assignment로 연결된 비-Draft 일정의 삭제되지 않은 자기 피드백만 볼 수 있다.

피드백과 댓글 삭제는 `deleted_at` soft-delete 후 7일 복구 유예를 둔다. `private.purge_deleted_feedback()`을 pg_cron이 매시간 실행해 만료된 row를 물리 삭제한다. 삭제된 피드백의 대화 전체는 함께 삭제하고, 개별 삭제 댓글의 미삭제 답글은 parent 연결만 해제해 보존한다. 함수는 외부 role에 공개하지 않는다.

## 9. 보강

`makeup_lessons` 상태:
- `requested`
- `scheduled`
- `completed`
- `cancelled`

`makeup_lessons`는 사유결석에서 발생한 보강 권리와 처리 workflow를 함께 나타낸다.

- `attendance_record_id`: 보강 권리를 만든 원 사유결석. 필수이며 전체 상태에서 UNIQUE
- `replacement_attendance_record_id`: 완료된 보강 일정의 해당 학생 출결
- `replacement_assignment_provenance`: 보강 매칭 시 배정이 `existing`, `created`, `reactivated` 중 무엇이었는지 기록
- `source_student_program_id`: 사유결석 원 assignment가 사용한 enrollment. 생성 후 변경 불가

수동 또는 source 없는 보강은 허용하지 않는다. 사유결석 출결이 저장되면 DB trigger가 같은 출결에 대한 requested 보강을 한 건만 생성한다.

lesson에는 프로그램이 없다. replacement assignment는 `source_student_program_id`를 사용하며 source 프로그램이 stopped가 되어도 이미 발생한 보강권은 유지된다.

### `schedule_makeup_lesson`
보강 배정과 replacement lesson assignment를 원자 처리한다.

Draft replacement도 허용한다.
Draft에서도:
- active assignment 생성
- enrollment 연결
- 시간 충돌 검사
- 운영자에게 표시
- 학생에게는 미노출

### 상태 전이

- `schedule_makeup_lesson`: requested → scheduled
- `reschedule_makeup_lesson`: scheduled 상태에서 replacement와 보강 소유 assignment를 한 transaction으로 변경
- 원 출결 excused → present/absent: requested/scheduled entitlement를 자동 cancelled
- 원 출결 present/absent → excused: 같은 cancelled row를 requested로 자동 재개하거나 row가 없으면 생성
- 대체 일정 출결 present/absent/excused 저장: replacement 출결을 직접 연결하고 scheduled → completed
- `complete_makeup_without_schedule`: 대체 일정 없이 requested → completed
- `restore_manual_makeup_completion`: 대체 일정 없이 수동 완료된 completed → requested

completed는 화면에서 하나의 `완료` 의미로만 표시한다. 대체 일정 출결로 자동 완료된 보강과 운영자가 대체 일정 없이 수동 완료한 보강을 별도 완료 탭이나 상태로 분리하지 않는다. 필요할 때 완료 카드에만 `대체 일정 완료` 또는 `일정 없이 완료`를 짧게 표시한다.

대체 일정 출결 완료는 terminal/read-only다. 보강 일정 출결이 present/absent/excused이면 별도 완료 버튼 없이 기존 보강이 completed가 된다. excused이면 그 replacement 출결에서 새 requested entitlement가 자동 생성된다. 이 경우 replacement attendance, assignment, feedback 등 실제 기록을 삭제하거나 되돌리지 않으므로 단순 복구를 제공하지 않는다.

대체 일정 없이 수동 완료한 보강은 replacement lesson/attendance/assignment를 만들지 않고, 일반 이용권 차감·반환도 하지 않는다. 처리자, 처리 시각, 선택적 메모를 기록하며 source attendance와 보강 권리는 유지한다. 이 완료 건은 같은 `makeup_lessons` row를 `requested`로 되돌리는 `보강 대기로 복구`가 가능하다. 복구 시 현재 완료 필드는 비우되 완료·복구 당시의 완료 경로, 처리자, 시각, 메모는 각각의 `makeup_lesson_events` row에 append-only로 보존한다. 완료 경로 구분은 화면 분류가 아니라 데이터 무결성과 복구 가능 여부 판정에만 사용한다.

원 사유결석을 non-excused로 바꾸면 requested/scheduled 보강은 자동 cancelled가 된다. completed 보강의 원 출결은 변경할 수 없다. cancelled source를 다시 excused로 저장하면 신규 row 없이 같은 ID가 requested로 재개된다.

대체 일정 변경 시 기존 provenance가 existing이면 이전 assignment를 보존한다. created/reactivated이면 출결·피드백·다른 활성 보강 사용이 없는 경우 자동 soft-unassign하고 새 assignment를 생성·복구한다. 보존 기록이 있으면 전체 transaction을 중단한다. 일반 일정 수정 경로가 scheduled 보강의 replacement assignment를 직접 해제하는 것도 DB trigger로 차단한다.

`makeup_lesson_events`는 생성·매칭·변경·완료·자동 취소·자동 재개를 append-only로 기록하며 `event_cause`로 운영자 처리, 원 출결 변경, 대체 출결을 구분한다. 완료·복구 이벤트에는 당시의 `completion_method`, 처리자, 시각, 선택 메모를 함께 보존한다. 운영자만 조회할 수 있다.

보강 배정·변경 뒤 보강관리, 일정 목록/상세, 학생 일정 cache를 함께 revalidate한다.

### 운영 수정

`update_makeup_reason`은 requested/scheduled 상태에서만 사유를 수정한다. 운영자 기본 UX에는 일정 배정/변경과 대체 일정 없는 수동 완료만 노출한다. 임의 보강 생성, 수동 취소·재개, 매칭 해제, requested hard delete는 제거한다. 보강 및 연결된 출결의 물리 삭제는 DB trigger/FK와 권한으로 차단한다. scheduled 보강이 연결된 대체 일정은 취소·삭제할 수 없고 먼저 보강관리에서 다른 일정으로 변경해야 한다.

## 10. 출결

`attendance_records`의 `(lesson_id, student_id)` 단일 최종 기록 구조를 유지한다.

상태:
- `present`
- `absent`
- `excused`

`recorded_at`은 최초 기록 시각이므로 유지한다.
Draft에는 출결을 기록하지 않는다.
출결 저장은 `attendance_records`만 변경하며 lesson 완료 상태를 만들지 않는다.
`lessons.completed`는 출결 완료가 아니라 확정 일정의 종료 시각 경과를 의미한다.

## 11. RLS

학생은 자기 데이터만 본다.
Draft는 다음 경로에서도 학생에게 노출되지 않는다.
- lessons
- lesson_assignments
- attendance_records
- makeup_lessons
- lesson_feedback
- lesson_staff

RLS 재귀 방지를 위해 `private` schema의 security-definer helper를 사용한다.

핵심 원칙:
- private schema 유지
- PostgREST 노출 금지
- 필요한 authenticated EXECUTE만 허용
- PUBLIC/anon에 노출하지 않음
- SECURITY DEFINER는 명확한 이유가 있을 때만 사용

## 12. 기존 보안 helper

`rls_auto_enable()`:
- SECURITY DEFINER 유지
- `search_path = pg_catalog`
- 외부 role EXECUTE 없음
- event trigger 사용

`private.current_student_id()`:
- authenticated EXECUTE 유지
- PUBLIC/anon/service_role EXECUTE 없음

## 13. 유지 결정

다음은 제거하지 않는다.
- `attendance_records.recorded_at`
- `monthly_activity_items.student_id`
- `monthly_activity_items.position`

## 14. 학생 일정 상세와 피드백 아카이브

`/student/schedule/[lessonId]`는 학생 RLS가 허용한 active assignment의 비-Draft 일정만 표시한다. 일정 내부 메모와 직원 인증 정보는 조회하지 않으며, 본인 출결과 미삭제 피드백 및 그 댓글만 bounded query로 읽는다.

PR22 중립 lesson DB와의 호환을 위해 PR23 프로그램 라벨은 lesson 컬럼이 아닌 학생 본인의 active assignment에 연결된 `student_programs.program_type`에서 조회한다.

피드백 제공 직원 표시는 `get_student_feedback_authors(uuid[])`가 담당한다. 이 함수는 `private.student_can_view_feedback()`을 통과한 최대 200개 피드백에 대해서만 `feedback_id`, 직원 등록 이름, 역할을 반환하며 직원 ID나 `auth_user_id`는 반환하지 않는다. 댓글 작성자도 같은 접근 판정을 사용하는 `get_student_feedback_comment_authors(uuid[])`가 댓글 ID와 안전한 표시 이름만 반환한다.

`/student/feedback` 기간 기준은 `lessons.starts_at`의 KST calendar date다. 학생 화면 URL은 `range=all|1m|3m|6m&sort=asc|desc`를 사용하며 버튼·정렬 변경 즉시 적용한다. 학생 화면의 직접 기간 입력은 제공하지 않고 잘못된 query는 전체·최신순으로 안전하게 정규화한다.

## 15. 운영자 학생별 피드백 조회와 작성

`/operator/students/[studentId]`는 삭제되지 않은 피드백을 수업일 최신순으로 정렬해 최근 4건만 요약하고, `/operator/students/[studentId]/feedback`은 같은 데이터를 KST 수업일 기간·정렬 URL 필터로 제공한다. 최근 카드에는 날짜와 오른쪽 상단 상세 진입, 일정명, 한 줄 본문, 제공 직원과 댓글 수만 표시한다.

학생별 독립 피드백 작성 route는 제거한다. 모든 피드백·댓글 mutation은 운영자 인증 뒤 lesson, student, active assignment, feedback의 lesson/student 조합을 다시 확인하고, 일정 상세, 학생 상세·전체 피드백, 학생 일정 상세·내 피드백을 함께 revalidate한다. 기존 `lesson_feedback`, `feedback_comments`, operator RLS와 assignment 복합 FK를 재사용하므로 별도 migration이나 RPC를 추가하지 않는다.

일정 상세의 피드백 진입은 roster의 학생별 modal로 통일한다. modal은 새 피드백을 저장하고 열린 상태를 유지하며, 같은 lesson/student의 기존 피드백은 읽기 전용으로 표시한다. 댓글은 삭제되지 않은 최상위 댓글과 답글의 합계만 조회하고 본문은 modal payload에 포함하지 않는다.

학생 상세와 전체 피드백의 조회 dialog는 별도 수정 page로 이동하지 않는다. 피드백 본문은 dialog 안의 inline textarea에서 수정하고, 로그인한 운영자가 직접 작성한 댓글·답글만 작은 수정·삭제 control을 표시한다. 댓글 소유권은 `author_user_id = auth.uid()`를 서버 action과 기존 RLS에서 함께 확인하며 삭제는 soft-delete다.

새 피드백 제공자는 해당 일정에 배정된 활성 담당 직원으로 제한한다. staff는 로그인한 본인만 자동 사용하고 본인 담당 일정에서만 작성하며, owner는 담당자가 한 명이면 자동 선택하고 여러 명이면 그 범위 안에서 선택한다. 저장 action은 운영자 인증, active assignment, 담당 staff, 제공자와 lesson 관계를 다시 확인한다.

## 16. 후속 구조

- 학생 계정 관리 전용 페이지
- `rental_reservations`

## 17. 직원 운영계정과 접근 권한

`operator_accounts`가 `owner | staff` 접근 수준과 로그인 사용 상태의 단일 source of truth다. Auth `app_metadata.role`은 기존처럼 `operator | student` 진입 역할만 나타내며, 사용자가 수정할 수 있는 metadata와 `staff_profiles.role`은 접근 권한 판정에 사용하지 않는다.

기존 유일한 operator Auth 사용자는 migration preflight로 다시 확인한 뒤 owner row로 bootstrap한다. 이메일·비밀번호·Auth ID는 변경하지 않고 직원 프로필에도 자동 연결하지 않는다. 직원은 `staff_profiles.auth_user_id`와 staff account가 함께 유효하고 직원 프로필이 active일 때만 접근할 수 있다.

RLS는 operator 공통 SELECT, owner mutation, 담당 staff의 출결·피드백·댓글 mutation으로 분리한다. 기존 `is_operator()`는 owner mutation 의미로 좁히고, active account·현재 staff·lesson 담당 여부는 `private` SECURITY DEFINER helper가 확인한다. `get_my_operator_context()`만 로그인한 본인의 안전한 capability 계산을 위해 public RPC로 둔다.

로그인 중지는 Auth ban과 `operator_accounts.is_login_enabled=false`를 함께 적용한다. Auth와 public DB는 단일 transaction이 아니므로 server action이 반대쪽 실패 시 보상 복구한다. 남아 있는 access token도 proxy, operator layout, server action, RPC/RLS의 active-account 확인에서 차단된다.

직원 로그인 아이디는 NFKC 정규화, trim, 소문자화 후 `[a-z0-9_-]{4,32}`만 허용하고 `staff.classlog.demo` 내부 Auth 이메일로 결정적으로 변환한다. 합성 이메일은 public DB, UI, URL, 로그에 노출하지 않는다. owner는 기존 이메일로 로그인한다.
