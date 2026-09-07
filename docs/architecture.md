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

일정 저장 RPC는 `lesson_category`를 명시적으로 받는다(NULL 포함). 시간·상태·배정 이용권 집합이 현재 row와 같으면 lesson row lock 아래 제목·장소·메모·분류만 수정해 배정과 출결·보강·quota를 그대로 보존한다. 목록은 category/status/month/q query를 조합하고 KST 시작월과 일정 제목을 사용한다.

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
- `published_at`
- `deleted_at`

`feedback_comments`:
- 댓글/답글 thread
- parent는 같은 feedback 안에서만 연결
- soft-delete
- `author_user_id`를 학생 `auth_user_id` 또는 직원 `auth_user_id`와 연결해 작성자 이름을 표시
- 직원 profile에 연결되지 않은 운영 계정은 `운영자`로 표시

기존 `feedback_responses`는 제거 완료했다.

학생은 게시되고 삭제되지 않은 자기 피드백만 볼 수 있으며 Draft 일정의 피드백은 볼 수 없다.

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

completed는 terminal/read-only다. 보강 일정 출결이 present/absent/excused이면 별도 완료 버튼 없이 기존 보강이 completed가 된다. excused이면 그 replacement 출결에서 새 requested entitlement가 자동 생성된다.

원 사유결석을 non-excused로 바꾸면 requested/scheduled 보강은 자동 cancelled가 된다. completed 보강의 원 출결은 변경할 수 없다. cancelled source를 다시 excused로 저장하면 신규 row 없이 같은 ID가 requested로 재개된다.

대체 일정 변경 시 기존 provenance가 existing이면 이전 assignment를 보존한다. created/reactivated이면 출결·피드백·다른 활성 보강 사용이 없는 경우 자동 soft-unassign하고 새 assignment를 생성·복구한다. 보존 기록이 있으면 전체 transaction을 중단한다. 일반 일정 수정 경로가 scheduled 보강의 replacement assignment를 직접 해제하는 것도 DB trigger로 차단한다.

`makeup_lesson_events`는 생성·매칭·변경·완료·자동 취소·자동 재개를 append-only로 기록하며 `event_cause`로 운영자 처리, 원 출결 변경, 대체 출결을 구분한다. 운영자만 조회할 수 있다.

보강 배정·변경 뒤 보강관리, 일정 목록/상세, 학생 일정 cache를 함께 revalidate한다.

### 운영 수정

`update_makeup_reason`은 requested/scheduled 상태에서만 사유를 수정한다. 운영자 기본 UX에는 일정 배정/변경만 노출한다. 임의 보강 생성, 수동 취소·재개·완료, 매칭 해제, requested hard delete는 제거한다. 보강 및 연결된 출결의 물리 삭제는 DB trigger/FK와 권한으로 차단한다. scheduled 보강이 연결된 대체 일정은 취소·삭제할 수 없고 먼저 보강관리에서 다른 일정으로 변경해야 한다.

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

`/student/schedule/[lessonId]`는 학생 RLS가 허용한 active assignment의 비-Draft 일정만 표시한다. 일정 내부 메모와 직원 인증 정보는 조회하지 않으며, 본인 출결과 게시·미삭제 피드백 및 그 댓글만 bounded query로 읽는다.

PR22 중립 lesson DB와의 호환을 위해 PR23 프로그램 라벨은 lesson 컬럼이 아닌 학생 본인의 active assignment에 연결된 `student_programs.program_type`에서 조회한다.

피드백 제공 직원 표시는 `get_student_feedback_authors(uuid[])`가 담당한다. 이 함수는 `private.student_can_view_feedback()`을 통과한 최대 200개 피드백에 대해서만 `feedback_id`, 직원 등록 이름, 역할을 반환하며 직원 ID나 `auth_user_id`는 반환하지 않는다. 댓글 작성자도 같은 접근 판정을 사용하는 `get_student_feedback_comment_authors(uuid[])`가 댓글 ID와 안전한 표시 이름만 반환한다.

`/student/feedback` 기간 기준은 `lessons.starts_at`의 KST calendar date다. URL은 빠른 기간에 `range=all|1m|3m|6m&sort=asc|desc`, 직접 기간에 `range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD&sort=asc|desc`를 사용한다.

## 15. 후속 구조

- 학생 계정 관리 전용 페이지
- `rental_reservations`
