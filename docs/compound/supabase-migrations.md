# Compound: Supabase migration / RLS 안전 규칙

이 문서는 Class Log에서 DB schema, RLS, Postgres function, trigger, view를 수정할 때 추가로 읽는다.

---

# 1. 목적

Class Log는 이미 원격 Supabase DB와 실제 데이터를 사용한다.

따라서 “SQL이 문법상 맞다”보다 다음이 더 중요하다.

- 기존 데이터가 안전하게 변환되는가?
- 기존 RLS가 깨지지 않는가?
- local/remote migration history가 일치하는가?
- UI 우회 시에도 무결성이 유지되는가?
- Supabase 내부 영역을 잘못 건드리지 않는가?

---

# 2. Migration 기본 원칙

## 기존 migration 수정 금지

이미 적용된 migration은 수정하지 않는다.

변경은 새 migration으로 추가한다.

**append-only**를 기본으로 한다.

## 적용 전 확인

최소 다음을 확인한다.

- 현재 branch
- working tree
- local migration 목록
- remote migration 목록
- 대상 table/constraint/function의 실제 상태
- 기존 row 수와 값 분포
- 관련 코드 사용처

---

# 3. 데이터 타입 변경

기존 데이터가 있는 컬럼의 타입을 바꾸기 전에 실제 값을 조회한다.

예:

`age text → integer`

라면 먼저:

- NULL 수
- 숫자가 아닌 값
- 범위 밖 값

을 확인한다.

변환할 수 없는 값이 있으면 임의로 버리거나 기본값으로 덮지 않는다.

---

# 4. Expand → Backfill → Validate → Constrain → Cleanup

기존 데이터가 있는 구조 변경은 가능하면 다음 순서를 사용한다.

1. 새 컬럼/구조를 nullable 상태로 추가
2. 기존 데이터 backfill
3. 누락/잘못된 row 검증
4. FK/CHECK/NOT NULL 적용
5. 코드가 새 구조로 전환됐는지 확인
6. 마지막에 기존 컬럼 cleanup

한 migration에서 무조건 모든 것을 동시에 삭제/변환하지 않는다.

---

# 5. Backfill 원칙

## 추측하지 않는다

실데이터를 근거로 mapping한다.

Class Log 현재 확인 사례:

- 기존 lesson 2건 → 모두 `weekday_vocal`
- 기존 students 2명 → active weekday_vocal enrollment
- 기존 assignment 4건 → 해당 enrollment 연결
- soft-unassigned assignment도 과거 이력으로 연결

## 기본값으로 숨기지 않는다

의미 있는 값을 산정할 수 없다면 `current_date`, 빈 문자열, 임의 enum 값으로 덮어 migration을 통과시키지 않는다.

예:

student_program.started_at을 기존 기록에서 산정할 수 없으면 중단하고 보고한다.

---

# 6. RLS

신규 public 앱 데이터는 RLS를 검토한다.

최소 역할:

- operator
- student

학생 정책에서는 항상 다음을 확인한다.

- 자기 row만 볼 수 있는가?
- 다른 학생 id를 직접 넣어도 차단되는가?
- relation을 따라가며 우회 노출되지 않는가?
- Draft가 assignment/feedback/makeup 경로를 통해 보이지 않는가?

---

# 7. `private.current_student_id()`

PR #15 이후 학생 RLS helper는 `private` schema에 있다.

현재 보안 성질:

- authenticated만 필요한 EXECUTE 유지
- PUBLIC/anon/service_role EXECUTE 없음
- PostgREST exposed schema에 private 없음
- 기존 policy dependency 유지

새 policy/helper 작업에서 이 구조를 public으로 되돌리지 않는다.

---

# 8. `rls_auto_enable()`

이 함수는 실제 event trigger `ensure_rls`에서 사용 중이다.

따라서 “사용처가 없어 보인다”는 이유로 삭제하지 않는다.

현재 원칙:

- SECURITY DEFINER 유지
- `search_path = pg_catalog`
- 외부 role EXECUTE 없음

---

# 9. SECURITY DEFINER

가능하면 `SECURITY INVOKER`를 우선한다.

SECURITY DEFINER가 정말 필요하면 최소 다음을 확인한다.

- 왜 필요한가?
- search_path 고정 여부
- EXECUTE grant 대상
- PostgREST RPC 노출 여부
- 함수가 호출자 입력으로 임의 object를 접근하지 않는가?

기본 PUBLIC EXECUTE 상태를 방치하지 않는다.

---

# 10. Trigger / RPC

DB trigger는 최종 무결성 방어선으로 사용한다.

RPC는 복수 변경을 한 transaction으로 묶거나, 검증+변경을 원자적으로 수행할 때 사용한다.

Class Log의 대표 사례:

- lesson + assignments
- student time overlap
- enrollment/lesson program 일치
- stopped enrollment 신규 배정 차단

UI 사전검사와 DB 최종검사를 함께 사용한다.

---

# 11. View

학생별 계산 상태 같은 read model은 비물질화 view를 우선 검토한다.

RLS가 중요한 view는 가능한 경우:

`security_invoker = true`

를 사용해 underlying table RLS를 따르게 한다.

view를 만들었다고 RLS가 자동으로 안전하다고 가정하지 않는다.

---

# 12. Supabase 내부 schema

다음은 Class Log 앱 테이블처럼 직접 정리하지 않는다.

- `realtime`
- `storage`
- `supabase_migrations`
- `vault`
- 기타 Supabase 관리 schema

사용하지 않는 것처럼 보여도 플랫폼 내부 기능과 연결될 수 있다.

---

# 13. Auth FK

`auth.users`와 연결된 FK의 delete 동작은 의미를 보고 결정한다.

예:

- 학생 Auth 연결: 기존 안전 정책 유지
- staff Auth 연결: 계정 삭제 후에도 과거 담당자 이력을 보존하기 위해 `ON DELETE SET NULL` 가능

Auth 계정 삭제가 앱 도메인 데이터를 무조건 cascade 삭제하게 만들지 않는다.

---

# 14. Destructive cleanup

컬럼/테이블/constraint 삭제 전 다음을 모두 확인한다.

- 코드 참조 0건
- view/function/trigger/policy dependency
- 기존 row migration 완료
- rollback 또는 복구 가능성
- 실제 사용자 데이터 손실 여부

“지금 UI에서 안 보인다”는 것만으로 삭제 근거가 되지 않는다.

---

# 15. 검증

DB 변경 후 최소:

```bash
supabase db lint
npm run lint
npm run build
git diff --check
```

를 수행한다.

그리고 migration history를 확인한다.

가능하면:

- 로컬/원격 migration 버전
- local-only
- remote-only

불일치가 없는지 확인한다.

---

# 16. RLS 회귀 테스트

DB lint 통과만으로 완료하지 않는다.

최소 시나리오:

## operator

- 필요한 CRUD 가능

## student

- 자기 데이터 조회
- 다른 학생 데이터 차단
- Draft 미노출
- unpublished/deleted feedback 미노출
- 허용되지 않은 mutation 차단

## 비인증

- 보호 데이터 접근 차단

---

# 17. 작업 중단 조건

다음은 임의 해결하지 않는다.

- 조사한 기존 데이터와 실제 DB가 다름
- backfill 누락 존재
- FK 적용 실패
- 예상하지 못한 기존 feedback/makeup 데이터 존재
- 기존 RLS dependency가 깨짐
- Auth 구조 변경이 필요함
- 데이터 손실 가능성 있음
- migration history가 local/remote 불일치

현재 상태와 필요한 판단을 보고한 뒤 진행한다.

---

# PR #16에서 실제로 확인한 추가 규칙

## 후속 fix도 append-only
실제 검증 중 발견된 문제는 기존 migration을 고치지 않고 새 migration으로 수정했다.

- `20260826090000_fix_reviewed_mutation_atomicity.sql`
- `20260826100000_fix_schedule_helper_execution.sql`

## Trigger/helper는 실제 mutation으로 검증
DB lint만 통과해도 trigger가 호출하는 helper의 EXECUTE 권한 문제는 남을 수 있다.
실제 operator mutation을 실행해 trigger/helper 호출 경로까지 확인한다.

## Transaction은 중간 상태도 유효하게
시간 변경 + 학생 제거처럼 trigger가 중간 상태를 검사하는 요청에서는 transaction이라는 이유만으로 안전하지 않다.
최종적으로 빠질 학생은 먼저 soft-unassign하는 등 중간 상태도 유효하도록 순서를 설계한다.

## 성공 판정은 affected row까지
중요한 mutation은 error뿐 아니라 실제 변경 row와 상태 조건도 확인한다.

## “반영 안 됨”은 층별로 확인
1. DB row
2. RPC 결과
3. RLS
4. server fetch
5. cache/revalidate
6. UI render

보강 배정 문제는 실제 DB가 아니라 cache revalidation 문제였다.
