# Class Log 주요 설계 결정

이 문서는 **무엇을 만들지**가 아니라 **왜 이렇게 결정했는지**를 기록한다.

나중에 코드만 보고 기존 결정을 되돌리거나 같은 조사를 반복하지 않도록 한다.

---

## 2026-09-09 — 제한된 연결 기록만 함께 정리하는 일정 hard delete

### 결정

피드백·댓글이나 취소되지 않은 보강 관계가 없는 lesson은 보호된 RPC에서 실제 삭제한다. 출결은 lesson과 함께 삭제한다. 대상 lesson과 관련 보강이 모두 취소 상태이면 보강 event와 보강 row도 같은 transaction에서 정리한다. 그 외 보강 상태와 피드백·댓글은 구체적인 사유로 삭제를 차단한다. 이용권 adjustment나 환불 ledger는 만들지 않고 assignment 기반 집계에서 자연스럽게 반환한다.

직접 table DELETE는 계속 trigger로 막는다. RPC 내부의 assignment·출결·취소 보강 삭제 예외는 클라이언트 GUC가 아니라 정확한 lesson과 makeup ID를 담은 private transaction capability로만 식별한다.

### 권한 경계

PR30에서 도입한 owner/staff 구분을 그대로 따른다. 삭제와 Draft 확정은 DB `private.is_owner()`와 서버 `requireOperatorAccess({ owner: true })`를 공통 경계로 사용한다. staff에게는 일정 조회만 허용하고 삭제·확정 mutation은 owner만 실행할 수 있으며 student와 anon은 모두 차단한다.

### 이유

피드백·댓글과 진행·완료된 보강의 의미 있는 운영 이력은 보존하면서, 일정과 함께 폐기하기로 한 출결 및 이미 취소된 보강 흔적은 사용자의 명시적 확인 아래 함께 정리하기 위해서다. Scheduled/Completed assignment가 사용하던 예약·사용 횟수도 별도 보정 이력 없이 정확히 되돌린다.

---

## 2026-09-08 — PR26 보강 완료 경로는 상태 분류가 아니다

### 결정

대체 일정 출결로 자동 완료된 보강과 운영자가 대체 일정 없이 수동 완료한 보강은 모두 `makeup_lessons.status = 'completed'`로 둔다. 화면에는 새 완료 상태나 완료 탭을 만들지 않고 기존 완료 목록에 함께 표시한다.

완료 경로는 `completion_method`로 내부 식별하며, 복구 가능 여부와 데이터 무결성 판정에만 사용한다. 대체 일정 출결 완료는 replacement attendance, assignment, feedback 등 실제 기록을 보존해야 하므로 단순 복구를 제공하지 않는다. 대체 일정 없이 수동 완료한 건만 같은 row를 `requested`로 되돌릴 수 있다. 복구 시 현재 완료 필드는 비우고 완료와 복구 당시의 완료 경로, 처리자, 시각, 메모는 별도의 append-only event row에 남긴다.

### 이유

운영자에게 필요한 분류는 “완료 여부” 하나이며, 완료 경로를 화면 탭으로 나누면 상태 의미가 늘어난 것처럼 보인다. 반면 데이터 내부에서는 수동 완료 건만 안전하게 복구할 수 있으므로 완료 원인을 보존해야 한다.

---

## 2026-09-04 — PR24 운영 분류와 편집 저장 범위

- 일정 카테고리는 weekday/weekend/trial의 분류·검색 정보다. PR22 중립 일정과 이용권 정책을 유지하며 exact-match를 복구하지 않는다. 기존 NULL은 운영자가 직접 분류한다.
- 기본정보와 이용프로그램은 서로 다른 RPC/action/form으로 저장한다. 프로그램 변경 transaction과 과거 enrollment/assignment는 보존한다. 다른 영역의 값을 재전송하지 않는다.
- 카테고리 등 일정 정보만 바뀌면 배정 upsert를 생략한다. 사용 기록·보강권과 관계없는 편집이 이용권 검증·차감에 영향을 주지 않도록 하기 위해서다.
- Draft 취소 버튼을 숨기고 기존 삭제 보호를 유지한다. 기존 새 일정 링크와 비밀번호 press-and-hold를 재사용하며 비밀번호 상태 접근성과 창 blur/모바일 이동 종료를 보완한다.
- 원격 migration은 별도 승인 후 적용한다. 현재 코드와 새 RPC가 함께 전환되어야 한다.

---

## 2026-09-04 — 잠금 순서·단일 배정·인증 연결 장애

- 다중 학생 잠금은 학생 UUID 오름차순으로 통일한다. 원격 두 세션에서 기존 확정/저장 deadlock을 재현했고 순서 통일 후 양쪽 RPC 완료와 데이터 rollback을 확인했다.
- 한 학생 추가 배정은 전용 RPC로 처리한다. 조회 후 전체 명단 저장은 다른 요청의 배정을 덮어쓸 수 있으므로 lesson row lock 아래 해당 학생만 변경한다.
- Draft 비노출은 학생용 집계에도 적용한다. 학생 화면의 Draft 개수와 Draft 전용 월 노출을 차단한다.
- Supabase 연결 실패·서버 장애·요청 제한은 세션 무효의 증거가 아니다. 역할 API는 503, 보호 경로는 일시 오류 안내를 사용하고 쿠키를 보존한다. 실제 무효 세션과 역할 위반은 계속 거부한다.

---

## 2026-09-02 — lesson은 프로그램이 없는 중립 일정

### 결정

- 프로그램 종류는 `student_programs`에만 둔다.
- `lesson_assignments.student_program_id`는 해당 참여가 사용하는 이용권이다.
- `lessons.program_type`과 exact-match 검증은 제거한다.
- `assignment_purpose`는 추가하지 않는다.

### 이유

한 lesson에서 평일보컬·주말보컬·체험 등 서로 다른 이용권을 사용하는 학생이 함께 참여할 수 있다. 프로그램은 일정 분류가 아니라 학생별 이용권이므로 assignment가 귀속을 표현하는 것이 중복과 예외가 가장 적다.

이 결정은 아래의 “lesson 하나는 하나의 프로그램”, “rental은 lesson에서 분리”, “기존 lesson은 weekday_vocal로 backfill” 결정을 대체한다. 과거 결정은 당시 구현 배경 기록으로 남긴다.

---

## 2026-09-02 — 일반 이용량은 확정 assignment에서 계산

### 결정

- Draft assignment는 차감하지 않는다.
- Scheduled 확정 시점부터 예약/사용량에 포함한다.
- 시작 전이며 attendance/feedback이 없는 경우만 soft-unassign 또는 취소로 반환한다.
- 기본 제공량 이후 증감은 append-only adjustment로 기록한다.
- 일반 차감 ledger나 `assignment_purpose`는 만들지 않는다.

### 이유

현재 assignment가 이미 “어느 이용권으로 어느 일정에 참여하는가”를 표현한다. 일반 사용 기록을 별도 row로 중복하면 상태 동기화가 필요하므로, DB lock 아래 확정 assignment를 집계하는 편이 단순하고 일관된다.

---

## 2026-09-02 — 보강은 source enrollment의 독립 1회 권리

### 결정

사유결석 시 원 assignment의 `student_program_id`를 `makeup_lessons.source_student_program_id`로 고정한다. 원 일반 이용 횟수는 반환하지 않고 보강권 1회를 별도로 생성한다. source enrollment가 stopped가 되어도 권리를 유지하며 replacement 월과 무관하게 사용할 수 있다.

### 이유

보강은 다음 달 일반 한도를 늘리는 adjustment가 아니라 특정 사유결석에서 발생한 1회성 권리다. source enrollment snapshot을 보존해야 중단·재등록 뒤에도 어느 이용기간에서 발생한 권리인지 바뀌지 않는다.

---

## 2026-09 — 학생 피드백 제공자 정보는 제한형 조회로 공개

### 결정

학생에게 피드백 제공 직원의 등록 이름과 역할을 표시하되, `staff_profiles` 학생 SELECT 범위를 피드백 관계 전체로 넓히지 않는다. 대신 학생 본인의 게시·미삭제·비-Draft 피드백만 검사하는 제한형 RPC가 피드백 ID, 이름, 역할만 반환한다.

### 이유

피드백 제공자는 반드시 해당 일정의 담당 직원일 필요가 없다. 기존 담당자 기반 RLS만으로는 실제 제공자를 항상 표시할 수 없고, staff row 전체 접근을 넓히면 직원 목록이나 `auth_user_id` 같은 내부 필드까지 직접 조회될 수 있기 때문이다.

---

## 2026-09 — 사유결석 한 건은 하나의 보강 workflow를 만든다

### 결정

`makeup_lessons`가 entitlement와 workflow를 함께 나타내며, 필수 UNIQUE `attendance_record_id`로 한 사유결석에 한 row만 허용한다. 수동/source 없는 보강은 만들지 않는다.

### 이유

보강의 근거를 출결과 직접 연결하고 같은 사유결석을 중복 처리하는 경로를 UI와 DB 양쪽에서 제거하기 위해서다.

---

## 2026-09 — 보강 lifecycle은 출결이 자동 결정한다

### 결정

- 원 출결이 excused가 되면 entitlement를 생성하거나 동일 cancelled row를 requested로 재개한다.
- 원 출결이 present/absent가 되면 requested/scheduled entitlement를 자동 cancelled로 만든다.
- 대체 일정 출결이 저장되면 보강을 자동 completed로 만든다.
- 보강관리의 정상 동선은 대체 일정 선택과 변경만 제공한다.
- completed는 terminal/read-only다.

### 이유

권리 생성·취소·재개·완료를 운영자의 별도 버튼에 의존시키면 출결과 보강 상태가 어긋날 수 있다. 출결이 근거 데이터이므로 DB trigger가 같은 transaction에서 lifecycle을 결정한다. 동일 row 재개는 이력과 1:1 entitlement 불변조건을 함께 유지한다.

---

## 2026-09 — replacement 출결로 보강 완료와 연쇄 entitlement를 결정한다

### 결정

replacement 출결이 present/absent/excused이면 기존 보강을 completed로 연결한다. excused이면 해당 replacement 출결을 source로 새 requested entitlement 한 건을 자동 생성한다.

원 출결을 non-excused로 변경할 때 requested/scheduled 보강은 자동 cancelled가 되며, completed 보강이 있으면 변경을 차단한다.

### 이유

보강 완료의 실제 근거를 replacement 출결로 남기고, 보강 일정에서도 다시 사유결석한 경우의 권리를 손실 없이 추적하기 위해서다.

---

## 2026-09 — 보강 소유 assignment는 안전하면 자동 정리한다

### 결정

대체 일정 변경 또는 원 출결 변경 시 created/reactivated assignment는 출결·피드백·다른 활성 보강 사용 여부를 확인한 뒤 자동 soft-unassign한다. existing assignment는 보강 이전부터 존재했으므로 보존한다. 의존 기록이 있으면 자동 정리하지 않고 전체 transaction을 중단한다.

### 이유

결정 가능한 정리를 체크박스로 운영자에게 맡기지 않으면서도, 독립 배정과 과거 기록을 훼손하지 않기 위해서다.

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

---

## 2026-09-01 — 학생정보와 이용프로그램을 원자 저장

### 결정

학생 기본정보, active 프로그램 중단, stopped 사유 수정, 이용 시작·재개를 하나의 RPC transaction으로 저장한다.

### 이유

profile만 저장되고 program reconciliation이 실패하는 반쪽 상태를 막고, 운영자가 한 편집 화면에서 변경 내용을 확인한 뒤 한 번만 저장하도록 하기 위해서다.

Auth 이메일은 public DB transaction에 포함할 수 없으므로 기존처럼 관리자 API에서 먼저 변경하고, RPC 실패 시 이전 이메일로 보상 복구한다.

## 2026-09-01 — 프로그램 재개는 새 enrollment

### 결정

stopped row는 과거 이력으로 유지하고 이용 재개 시 같은 프로그램의 새 active row를 만든다. accidental stop을 취소해 기존 row를 active로 되살리는 기능은 만들지 않는다.

### 이유

과거 이용기간과 중단 사유를 보존하고 lesson assignment가 참조하는 enrollment 의미를 바꾸지 않기 위해서다.

## 2026-09-01 — 학생 목록 상태는 enrollment에서 계산

### 결정

별도 category 컬럼 없이 `student_programs`와 `student_program_statuses`로 진행중, 휴식, 이용종료를 계산한다. active enrollment 판정을 stopped history보다 우선하며, active row가 모두 effective inactive여도 진행중 탭에 포함하고 행에서 `장기 미배정` 배지와 마지막 배정 경과를 표시한다.

상태 탭과 독립적인 이용프로그램 필터는 active enrollment가 있으면 현재 active 프로그램, 없으면 가장 최근 stopped 이용기간을 기준으로 판정한다. 이름 검색·상태·프로그램 선택은 URL query로 결합한다.

### 이유

여러 프로그램을 가진 학생도 하나의 일관된 목록 상태로 분류하고 저장 상태를 중복 관리하지 않으면서, `active`라는 운영 상태와 장기 미배정이라는 계산 신호를 서로 다른 탭으로 오해하지 않게 하기 위해서다.

---

## 2026-09-09 — 업무 역할과 운영 접근 권한을 분리

### 결정

`staff_profiles.role`의 `manager | vocal_trainer`는 업무 역할로 유지하고, 앱 접근 수준은 `operator_accounts.access_level`의 `owner | staff`로 판정한다. 기존 유일한 operator는 직원 프로필 연결 없이 owner가 된다.

### 이유

업무상 역할 변경이 관리자 승격으로 이어지지 않게 하고, 고아 operator Auth나 사용자 수정 metadata가 owner 권한을 얻지 못하게 하기 위해서다.

## 2026-09-09 — staff mutation은 담당 일정의 본인 기록으로 제한

### 결정

staff는 전체 운영 데이터를 조회할 수 있지만 `lesson_staff`에 본인이 배정된 일정의 출결, 본인이 제공자 또는 입력자인 피드백, 댓글·답글만 변경한다. 다른 직원 제공자로 기록할 수 없고 피드백 삭제는 owner만 수행한다.

### 이유

공통 `/operator/*` 화면을 유지하면서도 공식 기록의 작성 주체와 관리 책임을 DB까지 일관되게 보존하기 위해서다.

## 2026-09-09 — 직원 보관과 로그인 상태를 함께 전환

### 결정

직원 보관 시 연결된 Auth를 ban하고 DB 로그인 상태도 끄며, 복원 시 같은 Auth와 로그인 아이디를 재활성화한다. Auth 작업과 public DB 작업 중 후행 작업이 실패하면 선행 작업을 보상 복구한다.

### 이유

과거 담당·피드백 이력을 유지하면서 고아 또는 중복 Auth 계정을 만들지 않고, 남아 있는 JWT도 즉시 DB 권한에서 차단하기 위해서다.
