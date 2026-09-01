# Class Log 아키텍처

이 문서는 Class Log의 현재 데이터 모델과 기술적 불변조건의 원본이다.
제품 요구사항은 `docs/product-plan.md`, 설계 판단 이유는 `docs/decisions.md`를 따른다.

## 현재 기준

- 구현 브랜치: `feat/excused-makeup-workflow`
- 기준 main commit: `8568c7e111ebe87603633d30b3e8bdd2b8333fdb`
- PR #18 운영 UX 개선 merge 완료
- local/remote migration: 24개 일치
- PR #19 신규 migration: `20260901000000_add_excused_makeup_workflow.sql`, `20260901010000_protect_scheduled_makeup_assignments.sql`, `20260901020000_automate_makeup_lifecycle.sql`, `20260901030000_fix_makeup_event_cause.sql`

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

저장 상태:
- `active`
- `stopped`

중단 사유:
- `break`
- `ended`
- `other`

같은 학생+프로그램의 active enrollment는 동시에 한 건만 허용한다.
`inactive`는 저장하지 않고 `student_program_statuses` view에서 계산한다.

## 3. 일정

`lessons.program_type`:
- `weekday_vocal`
- `weekend_vocal`
- `trial`

`lessons.status`:
- `draft`
- `scheduled`
- `completed`
- `cancelled`

`rental`은 lesson에서 제외한다.

기존 lesson은 평일보컬로 backfill 완료했다.

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
assignment의 학생/프로그램과 lesson의 program_type은 일치해야 한다.

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

### `confirm_draft_lesson`
Draft를 scheduled로 확정한다.

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

수동 또는 source 없는 보강은 허용하지 않는다. 사유결석 출결이 저장되면 DB trigger가 같은 출결에 대한 requested 보강을 한 건만 생성한다.

replacement lesson은 원수업과 같은 program_type이어야 한다.

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

## 14. 후속 구조

### 학생 일정 상세
학생의 `내 일정`에서 일정 클릭 → 상세 페이지.

표시 후보:
- 일정 정보
- 담당자
- 본인 출결
- 게시된 피드백
- 댓글/답글

### 기타 후속
- 학생 계정 관리 전용 페이지
- `rental_reservations`
