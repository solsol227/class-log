# Class Log 주요 설계 결정

이 문서는 **무엇을 만들지**가 아니라 **왜 이렇게 결정했는지**를 기록한다.

나중에 코드만 보고 기존 결정을 되돌리거나 같은 조사를 반복하지 않도록 한다.

---

## 2026-08 — 직원 삭제는 항상 복원 가능한 보관 처리

### 결정

운영자에게는 하나의 `삭제` 동작을 제공하고 참조 유무와 관계없이 `is_active = false`로 보관한다.

- 직원 profile을 hard delete하지 않는다.
- 보관된 직원은 복원할 수 있다.
- 화면에 별도의 상시 활성/비활성 관리 토글은 제공하지 않는다.

### 이유

실수 삭제를 복원하고 과거 수업·피드백 및 직원별 활동 대시보드의 기록을 일관되게 보존하면서, 운영자에게 내부 상태 관리를 맡기지 않기 위해서다.

기존 `is_active`는 신규 담당자·피드백 제공자 선택과 DB 검증에 필요한 내부 값이므로 유지한다.

---

## 2026-08 — lesson status를 일정 종료 시각과 일치

### 결정

`draft`와 `cancelled`는 명시적 상태로 유지한다.

확정 일정은 `ends_at`과 DB `now()`를 기준으로 `scheduled` 또는 `completed`를 저장한다. 출결 저장은 lesson status를 변경하지 않는다.

MVP에서는 운영자 화면이 실제 조회한 lesson ID만 동기화 RPC에 전달한다. 학생 조회는 mutation을 일으키지 않고, 화면 helper는 stale row를 방어하기 위해 같은 시간 기준 계산을 유지한다.

### 이유

`completed`를 출결 처리 완료 의미로 사용하면 일정 종료 여부와 DB·화면 상태가 달라진다. 일정 저장과 운영자 조회 동기화에서 상태를 시간 기준으로 계산하면 과거·미래 일정 수정에도 같은 규칙을 적용할 수 있다.

운영자 조회 동기화는 `scheduled AND ends_at <= now()`인 전달 ID만 변경해 idempotent하게 유지한다. 장기적으로 조회와 독립적인 정합성이 필요해지면 Supabase scheduled job/cron으로 교체하거나 보완한다.

---

## 2026-08 — `students.id`와 `auth_user_id`를 분리 유지

### 결정

두 필드를 합치지 않는다.

### 이유

- `students.id`: Class Log 도메인의 학생 식별자
- `auth_user_id`: Supabase Auth 계정 식별자

책임이 다르다.

---

## 2026-08 — `nickname`을 로그인 식별자와 표시 이름으로 함께 사용

### 결정

`nickname`을 유지하고 별도 `display_name`을 제거한다.

`nickname`을 `login_id`로 rename하지 않는다.

### 이유

실제 운영에서 로그인 이름과 표시 이름을 따로 관리할 필요가 없다고 결정했다.

현재 실데이터에서도 두 학생의 `nickname`과 `display_name`은 모두 동일했다.

---

## 2026-08 — `age`는 integer

### 결정

자유 text가 아니라 숫자로 관리한다.

### 이유

나이는 숫자 검증과 향후 통계에 적합한 형태여야 한다.

현재 기존 age 데이터는 모두 NULL이라 변환 위험이 낮다.

---

## 2026-08 — 유입경로는 고정 선택값

### 결정

- instagram
- daangn
- referral
- naver

### 이유

자유입력은 같은 의미가 여러 표현으로 저장되어 향후 통계가 어려워진다.

현재 기존 acquisition_source는 모두 NULL이라 mapping 위험이 낮다.

---

## 2026-08 — 학생 프로그램을 `students.category` 하나로 저장하지 않음

### 결정

프로그램 이력을 별도 `student_programs` 관계로 관리한다.

### 이유

한 학생이:

- 여러 프로그램을 동시에 이용하거나
- 같은 프로그램을 중단 후 다시 시작

할 수 있기 때문이다.

단일 category는 이력을 표현하지 못한다.

---

## 2026-08 — 프로그램 저장 상태는 active/stopped만 사용

### 결정

`inactive`를 저장 status로 만들지 않는다.

### 이유

inactive는 시간이 지나면 자연스럽게 바뀌는 계산 가능한 상태다.

운영자가 매번 상태를 직접 바꾸는 일을 줄이기 위해 마지막 관련 lesson/assignment를 기준으로 계산한다.

---

## 2026-08 — 같은 프로그램의 active enrollment는 한 건

### 결정

과거 이력은 여러 건 보존하되 같은 학생+프로그램의 active row는 동시에 하나만 허용한다.

### 이유

과거 이용 이력을 지우지 않으면서 현재 상태의 모순을 막기 위해서다.

---

## 2026-08 — lesson 하나는 하나의 프로그램

### 결정

일반 lesson은:

- weekday_vocal
- weekend_vocal
- trial

중 하나에 속한다.

### 이유

일정의 프로그램을 명확하게 알아야 학생 enrollment와 배정 무결성을 검증할 수 있다.

---

## 2026-08 — rental은 lesson에서 분리

### 결정

학생 프로그램으로 `rental`은 유지하지만 실제 예약 일정은 lesson으로 만들지 않는다.

### 이유

lesson은 출결·피드백·보강과 강하게 연결된다.

대여는 일반적으로 이 정책들이 필요하지 않아 lesson에 넣으면 예외가 계속 늘어난다.

향후 별도 reservation 도메인으로 설계한다.

---

## 2026-08 — 기존 lesson은 모두 weekday_vocal로 backfill

### 확인 근거

실제 DB 조회 결과 기존 lesson은 2건이며, 사용자가 현재 존재하는 모든 일정이 평일보컬이라고 확인했다.

### 결정

기존 lesson을 임의 추측하지 않고 모두 `weekday_vocal`로 backfill한다.

---

## 2026-08 — 기존 assignment soft-unassign 구조 유지

### 결정

`lesson_assignments`의 `(lesson_id, student_id)` PK를 유지하고, 배정 해제는 `unassigned_at`, 재배정은 기존 row 재활성화를 사용한다.

### 이유

실제 DB에서 이미 정상 작동하고 있으며 과거 배정 이력을 보존한다.

surrogate assignment ID로 바꿀 필요가 없다.

---

## 2026-08 — `lesson_assignments.student_program_id` 추가

### 결정

배정이 어떤 학생 프로그램 enrollment에 속하는지 명시한다.

### 이유

lesson의 프로그램과 학생의 프로그램이 실제로 일치하는지 검증해야 한다.

또한 프로그램별 inactive 계산에도 연결 정보가 필요하다.

---

## 2026-08 — Draft도 시간 슬롯을 점유

### 결정

학생이 배정된 Draft lesson도 동일 학생 시간 충돌 검사에 포함한다.

### 이유

Draft는 운영자가 실제로 임시 확보한 일정이다.

확정 전이라는 이유로 같은 학생을 같은 시간에 여러 임시 일정에 넣으면 운영 충돌이 발생한다.

---

## 2026-08 — 동일 학생 시간 중복은 DB에서도 막음

### 결정

UI 경고만으로 끝내지 않고 RPC/DB 검증을 둔다.

### 이유

다른 호출 경로나 동시 요청으로 UI 검증을 우회할 수 있기 때문이다.

---

## 2026-08 — lesson과 assignments는 transaction으로 저장

### 결정

가능하면 Postgres RPC/function 한 transaction에서 처리한다.

### 이유

lesson만 저장되고 assignment 저장이 실패하는 반쪽 상태를 막기 위해서다.

---

## 2026-08 — `attendance_records.recorded_at` 유지

### 결정

제거하지 않는다.

### 이유

실제 UI에서 최초 출결 기록 시각으로 사용 중이다.

수정 시에도 보존되므로 `created_at`/`updated_at`과 의미가 다르다.

---

## 2026-08 — attendance UNIQUE 유지

### 결정

`(lesson_id, student_id)`의 기존 UNIQUE를 유지한다.

### 이유

한 학생+한 수업의 최종 출결 상태는 하나만 존재해야 하며 DB에 이미 제약이 있다.

중복 constraint를 새로 만들지 않는다.

---

## 2026-08 — lesson 시간 순서 constraint 유지

### 결정

`ends_at > starts_at`을 DB와 UI에서 모두 유지한다.

### 이유

실제 DB에 이미 constraint가 존재하므로 중복 생성하지 않는다.

---

## 2026-08 — `monthly_activity_items.student_id` 유지

### 결정

plan에 student가 있어도 item의 student_id를 제거하지 않는다.

### 이유

실제 코드/DB에서:

- RLS
- `(plan_id, student_id)` 무결성

에 사용된다.

---

## 2026-08 — `monthly_activity_items.position` 유지

### 결정

created_at/updated_at으로 대체하지 않는다.

### 이유

position은 사용자에게 보이는 수동 순서를 표현한다.

timestamp는 수정 시각일 뿐 순서 의미가 없다.

---

## 2026-08 — lesson_feedback의 단일 feedback UNIQUE 제거

### 결정

한 `(lesson_id, student_id)`에 여러 feedback을 허용한다.

### 이유

운영자는 한 수업/학생에 여러 피드백을 추가·수정·삭제할 수 있어야 한다.

현재 실제 feedback 데이터는 0건이다.

---

## 2026-08 — feedback과 comments를 분리

### 결정

- feedback = 공식 기록
- comments = 이후 대화

### 이유

원래 피드백 본문을 채팅처럼 계속 수정하는 것보다 기록과 대화를 분리하는 것이 명확하다.

기존 `feedback_responses`는 1:1 구조라 thread 요구에 맞지 않는다.

현재 실제 response 데이터는 0건이다.

---

## 2026-08 — 실제 피드백 제공자와 입력자를 분리

### 결정

실제 제공 직원과 Class Log에 입력한 Auth 사용자를 따로 기록한다.

### 이유

보컬트레이너가 피드백을 제공하고 매니저가 대신 입력할 수 있기 때문이다.

---

## 2026-08 — 업무 역할과 Auth 역할을 분리

### 결정

Auth/RLS:
- operator
- student

업무 역할:
- manager
- vocal_trainer

### 이유

로그인 권한과 실제 현장 역할은 같은 개념이 아니다.

로그인하지 않는 trainer도 담당자로 기록할 수 있어야 한다.

---

## 2026-08 — 보강은 workflow로 관리

### 결정

requested → scheduled → completed 흐름을 유지하고 cancelled를 이력으로 둔다.

### 이유

보강은 단순 일정 속성이 아니라 “아직 처리해야 하는 운영 업무”다.

---

## 2026-08 — 열린 보강은 원수업+학생당 하나

### 결정

requested/scheduled 상태의 열린 보강을 중복 생성하지 않는다.

### 이유

같은 결손을 여러 번 보강 처리하는 운영 오류를 막는다.

---

## 2026-08 — activity_type은 지금 만들지 않음

### 결정

현재는 program_type까지만 구현한다.

### 이유

프로그램 내부 세부 활동 종류가 아직 충분히 확정되지 않았다.

필요가 명확해지기 전에 컬럼부터 만드는 과설계를 피한다.

---

## 2026-08 — 학생 계정 관리 전용 페이지는 후속

### 결정

현재 데이터모델 작업에서는 새 계정 관리 페이지를 구현하지 않는다.

### 이유

현재 학생 생성/Auth 흐름은 이미 존재하며, 계정 관리 UX는 별도 기능으로 설계할 예정이다.

---

## 2026-08 — Supabase 내부 schema를 앱 정리 대상으로 보지 않음

### 결정

`realtime`, `storage`, `supabase_migrations`, `vault` 등을 “안 쓰는 테이블”이라는 이유로 삭제하거나 수정하지 않는다.

### 이유

Supabase 플랫폼 내부 동작을 위한 관리 영역이다.

---

## 2026-08 — DB migration은 append-only

### 결정

이미 적용된 migration을 수정하지 않고 새 migration을 추가한다.

### 이유

로컬/원격 migration history 불일치와 운영 DB 재현 문제를 막기 위해서다.

---

## 2026-08-25 — Security Definer helper hardening

### 결정/결과

PR #15에서:

- `rls_auto_enable()`은 event trigger 사용 때문에 유지
- PUBLIC execute만 제거
- `current_student_id()`는 같은 function object를 private schema로 이동
- authenticated execute와 기존 RLS dependency 유지

### 이유

보안 경고를 해결하면서 기존 11개 RLS policy와 event trigger 동작을 깨뜨리지 않기 위해서다.

---

## 2026-08-27 — Draft도 보강 replacement로 허용

### 결정
보강 대기 건을 Draft lesson에도 배정할 수 있다.

### 이유
Draft는 운영자가 실제로 임시 확보한 일정이며, 보강 자리도 미리 잡을 수 있어야 한다.

### 조건
- 동일 program_type
- 시간 충돌 검사 적용
- active assignment 생성
- 학생에게 Draft 미노출
- Draft 확정 후 학생에게 노출

## 2026-08-27 — 시간 변경 전 제거 대상 assignment를 먼저 soft-unassign

### 결정
`save_lesson_with_assignments()`에서 최종 선택에서 빠지는 학생은 lesson 시간 변경 전에 soft-unassign한다.

### 이유
시간 변경과 학생 제거를 같은 요청에서 수행할 때 최종적으로는 빠질 학생 때문에 overlap trigger가 잘못 실패하는 문제를 실제 재현했다.

## 2026-08-27 — 담당직원 교체와 보강 완료는 RPC transaction

### 결정
담당직원 교체는 `replace_lesson_staff`, 보강 완료는 `complete_makeup_lesson`에서 원자 처리한다.

### 이유
DELETE 후 INSERT 중간 실패나 완료 조건 확인 후 상태 변경 실패 같은 반쪽 상태를 막기 위해서다.

## 2026-08-27 — Mutation 성공은 실제 영향 row까지 확인

### 결정
중요한 update/delete는 error 없음만으로 성공 처리하지 않는다.

### 이유
0행 update도 오류 없이 끝날 수 있어 사용자에게 잘못된 성공 메시지를 보여줄 수 있기 때문이다.

## 2026-08-27 — 보강 배정 후 관련 화면 cache 함께 갱신

### 결정
보강 배정 뒤 보강관리뿐 아니라 일정 목록, replacement 상세, 학생 일정도 revalidate한다.

### 이유
DB/RPC는 정상인데 cache 때문에 일정관리에서 배정이 안 보이는 문제를 실제 확인했다.

## 2026-08-27 — 다음 보강 구조는 사유결석 기반으로 개선

### 결정
향후 보강 생성은 임의 등록보다 사유결석 기록에서 보강 가능 건이 발생하는 구조로 바꾼다.

### 이유
실제 운영 규칙상 보강은 사유결석이라는 근거에서 발생해야 한다.
