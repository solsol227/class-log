# Class Log AI 에이전트 하네스

이 저장소에서 작업하는 AI 에이전트는 작업 시작 전에 이 문서를 읽는다.
이 문서는 제품 요구사항이나 DB 구조를 복제하지 않고, 어떤 원본을 읽고 어떻게 작업할지만 정의한다.

## 문서 읽기 순서

작업 성격에 맞게 다음 순서로 확인한다.

1. `docs/product-plan.md`
2. `docs/architecture.md`
3. `docs/decisions.md`
4. `docs/design-system.md`
5. `docs/git-workflow.md`
6. `docs/tasks.md`의 관련 항목
7. 최근 작업 맥락이 필요하면 `docs/dev-log.md`

DB, RLS, migration, Postgres function 작업이라면 추가로 `docs/compound/supabase-migrations.md`를 읽는다.

## 작업 시작 체크

1. 현재 branch와 `git status`를 확인한다.
2. 최근 커밋과 최신 `main` 기준 여부를 확인한다.
3. 관련 코드, migration, 문서와 decision을 먼저 읽는다.
4. 변경 범위와 검증 항목을 정한다.
5. DB 구조를 바꾼다면 실제 기존 row, constraint, 의존성을 먼저 확인한다.

## MUST

1. 이미 적용된 migration은 수정하지 않는다.
2. DB 변경은 append-only migration으로 만든다.
3. schema 변경 전 기존 데이터와 코드 사용처를 확인한다.
4. 신규 public 앱 데이터의 RLS 필요 여부를 검토한다.
5. student/operator 접근을 각각 회귀 검증한다.
6. UI 검증만으로 데이터 무결성을 보장했다고 판단하지 않는다.
7. `docs/decisions.md`의 결정을 이유 없이 뒤집지 않는다.
8. 기존 구조로 해결 가능한지 확인한 뒤 새 컬럼이나 테이블을 추가한다.
9. 작업 성격에 맞는 lint, build, DB lint와 실제 흐름 검증을 수행한다.
10. 중요한 확인사항과 구현 변화는 관련 문서 또는 `docs/dev-log.md`에 반영한다.
11. 문서와 실제 구현이 다르면 구현을 우선 확인하고 차이를 보고하거나 문서를 갱신한다.

## NEVER

1. `main`에서 직접 기능 구현을 시작하지 않는다.
2. 원격에 적용된 migration history를 수정하거나 재작성하지 않는다.
3. Supabase 내부 schema를 사용하지 않는다는 이유로 삭제하거나 정리하지 않는다.
4. 비밀번호, secret, service role key, JWT를 코드·로그·문서에 남기지 않는다.
5. RLS helper를 이유 없이 public RPC로 노출하지 않는다.
6. soft-delete 또는 soft-unassign 이력을 정리 목적으로 물리 삭제하지 않는다.
7. 확정되지 않은 도메인이나 권한 구조를 미리 확장하지 않는다.
8. 데이터 손실 위험이나 문서와 구현의 충돌을 임의 추측으로 우회하지 않는다.
9. 사용자가 요청하지 않은 대규모 재구성이나 라이브러리 도입을 하지 않는다.
10. `git push --force`, `git reset --hard` 같은 되돌리기 어려운 명령을 임의 실행하지 않는다.

## DB/RLS 작업 추가 문서

다음 중 하나라도 포함되면 `docs/compound/supabase-migrations.md`를 추가로 읽는다.

- migration
- table, column, constraint
- RLS, security definer
- Postgres function, RPC, trigger, view
- `auth.users` FK
- data backfill

## 작업 종료 체크

1. `git status`
2. 변경 파일 범위 확인
3. `git diff --check`
4. 관련 lint, build, DB lint
5. 주요 기능 회귀 검증
6. RLS 작업이면 operator/student 접근 검증
7. migration 작업이면 local/remote migration 상태 확인
8. 관련 문서와 `docs/dev-log.md` 업데이트
9. 구현과 문서의 차이 확인
10. 다음 작업과 막힌 점 인계

## 현재 기준점

- 기준 branch: `main`
- PR #16 merge commit: `dc69f7bc072aabf5d81399870f5469179b05d793`
- local/remote migration: 17개
- PR #16 신규 migration: 11개 (`20260826000000` ~ `20260826100000`)
- 학생 프로그램, Draft, 시간 충돌, 직원, 피드백, 보강 운영 기능 구현 완료
- 일정·보강·담당자 핵심 mutation 원자화 완료
- 다음 큰 설계 과제: 사유결석 기반 보강

현재 `main`이 이 기준보다 앞서 있다면 git history와 `docs/dev-log.md`를 먼저 확인한다.
