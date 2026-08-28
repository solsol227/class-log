# Class Log 아키텍처

이 문서는 Class Log의 현재 데이터 모델과 기술적 불변조건의 원본이다.
제품 요구사항은 `docs/product-plan.md`, 설계 판단 이유는 `docs/decisions.md`를 따른다.

## 현재 기준

- 기준 브랜치: `main`
- PR #16 merge 완료
- merge commit: `dc69f7bc072aabf5d81399870f5469179b05d793`
- local/remote migration: 17개 일치
- PR #16 신규 migration: 11개 (`20260826000000` ~ `20260826100000`)

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

기존 `feedback_responses`는 제거 완료했다.

학생은 게시되고 삭제되지 않은 자기 피드백만 볼 수 있으며 Draft 일정의 피드백은 볼 수 없다.

## 9. 보강

`makeup_lessons` 상태:
- `requested`
- `scheduled`
- `completed`
- `cancelled`

같은 원수업+학생에 requested/scheduled 열린 보강은 동시에 한 건만 허용한다.

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

보강 배정 뒤 다음 화면을 함께 revalidate한다.
- 보강관리
- 일정 목록
- replacement 일정 상세
- 학생 일정

### `complete_makeup_lesson`
보강 완료 조건 확인과 상태 변경을 원자 처리한다.

## 10. 출결

`attendance_records`의 `(lesson_id, student_id)` 단일 최종 기록 구조를 유지한다.

상태:
- `present`
- `absent`
- `excused`

`recorded_at`은 최초 기록 시각이므로 유지한다.
Draft에는 출결을 기록하지 않는다.

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

### 사유결석 기반 보강
현재 수동 보강 등록을 향후 아래 흐름으로 바꾼다.

`excused attendance → 보강 가능 건 → 보강 대기 → 일정 배정 → 완료`

같은 사유결석의 중복 보강을 막고 원 출결과 보강을 추적할 수 있게 한다.

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
