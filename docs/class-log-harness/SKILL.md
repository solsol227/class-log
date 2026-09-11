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

## 검증 효율 원칙

검증의 목적은 명령을 많이 실행하는 것이 아니라,
오류를 필요한 시점에 발견하면서 전체 작업 시간을 최소화하는 것이다.

### 기본 원칙

- ESLint, TypeScript, production build, `git diff --check`를 작은 코드 수정마다 반복 실행하지 않는다.
- 동일한 검증을 의미 없이 반복하지 않는다.
- 기능 단위 구현이 끝난 시점에 전체 검증을 한 번 수행하는 것을 기본으로 한다.
- 마지막 전체 검증 이후 코드가 변경됐다면 변경 영향에 필요한 검증만 다시 수행한다.
- Git 마무리 직전에는 최종 검증 결과가 최신 코드 기준인지 확인한다.

### 기능 단위 완료 시 검증 순서

1. `npm run lint:fix`를 단독 실행하고 자동 수정된 diff를 확인한다.
2. 자동 수정이 끝난 같은 코드 기준으로 `npm run lint`, `npm run typecheck`, `git diff --check`를 병렬 실행한다.
3. 병렬 검사 하나가 실패해도 나머지를 취소하지 않고 결과를 모두 모아 한 번에 수정한다.
4. 위 검사 프로세스가 모두 끝나면 `npm run build`를 실행한다.
5. 수정 후에는 실패한 검사와 변경 영향에 필요한 검사만 다시 실행하고, 최종 코드 기준 결과를 확인한다.

`lint:fix`는 파일을 변경하므로 다른 검사와 동시에 실행하지 않는다. TypeScript 검사와 production build는 모두 `.next`의 생성 타입을 읽거나 갱신할 수 있으므로 동시에 실행하지 않는다. ESLint, TypeScript, diff 검사는 서로의 결과를 기다릴 필요가 없어 병렬로 결과를 수집한다.

### 개발 중 검증

개발 도중에는 가능한 한 빠르고 좁은 검증을 우선한다.

예:
- TypeScript 변경 → 필요한 경우 typecheck
- SQL/RPC 변경 → 관련 SQL 또는 DB 검증
- UI copy/layout → 전체 production build 반복 금지

전체 production build는 기능 단위 구현 완료 시점에 수행하는 것을 기본으로 한다.

### 예외

다음 경우에는 중간 검증을 수행할 수 있다.

- 큰 구조 변경 직후 다음 작업의 전제가 되는 경우
- migration/RPC 변경이 이후 앱 구현의 기반이 되는 경우
- 오류를 조기에 발견하지 않으면 대규모 재작업 가능성이 높은 경우
- 이전 검증 실패를 수정한 직후 확인이 필요한 경우

중간 검증을 수행한 경우에도 같은 전체 검증을 불필요하게 연속 반복하지 않는다.

### 작업 분할 기준

작업을 단순히 작게 나누는 것 자체를 목표로 하지 않는다.

- 여러 단계로 나눠도 총 작업 시간과 위험이 동일하다면 하나의 연속 작업으로 진행할 수 있다.
- 작업을 나눔으로써 중복 조사, 중복 build, 중복 context loading이 늘어난다면 나누지 않는다.
- 반대로 단계 분리가 잘못된 방향의 대규모 구현을 막거나 재작업을 줄인다면 분리한다.

즉 작업 분할 여부는 "작업 크기"가 아니라
전체 실행 시간, 재작업 위험, 검증 비용을 기준으로 결정한다.

### 브라우저 검증

- 브라우저 자동화가 즉시 동작하면 사용할 수 있다.
- 브라우저 플러그인, trust path, 연결 환경 문제 해결에 시간을 소비하지 않는다.
- 공개 화면(`/`, `/login/operator`, `/login/student`)은 Supabase 연결 없이 레이아웃을 확인할 수 있다.
- 보호 화면(`/operator/*`, `/student/*`)은 단순 UI가 아니라 Supabase Auth, role claims, RLS, 원격 DB 조회에 의존한다.
- 보호 화면을 확인해야 하는 작업에서는 가능한 한 작업 초반에 Supabase 접속 가능한 로컬 dev/prod 서버를 띄우고, 그 서버를 유지한 채 중간 브라우저 확인을 진행한다.
- 별도 git worktree에는 Git에서 제외된 `.env.local`이 자동으로 따라오지 않는다. worktree에서 로그인·보호 화면을 검증할 때는 원본 checkout의 값을 출력하거나 복사·커밋하지 말고, 필요한 환경변수를 검증 프로세스에 안전하게 전달한다.
- `NEXT_PUBLIC_*` 환경변수는 production 브라우저 번들에 **build 시점**에 포함된다. `next start`를 실행할 때만 환경변수를 전달해서는 안 되며, 같은 환경변수를 전달한 상태에서 `next build`부터 다시 실행해야 한다.
- production 서버도 Supabase로 나가는 네트워크가 허용된 환경에서 실행한다. 브라우저 로그인만 성공하고 역할 API나 보호 화면이 실패하면, 브라우저가 아니라 Next 서버의 외부 네트워크 제한 여부도 확인한다.
- 사용자에게 브라우저 검증을 넘기기 전에 합성된 존재하지 않는 계정으로 로그인을 한 번 시도한다. `입력한 계정 정보가 올바르지 않습니다`가 나오면 브라우저에서 Supabase Auth까지 연결된 것이고, 환경변수 누락으로 인한 `일시적인 오류`와 구분할 수 있다. 실제 사용자 비밀번호를 대신 입력하거나 출력하지 않는다.
- 가능하면 같은 서버에 `node scripts/verify-local-login.mjs`를 실행해 실제 테스트 operator/student 로그인, 역할 API, 보호 화면 HTTP 응답까지 함께 확인한다.
- 로그인 폼에서 즉시 `일시적인 오류`가 나오고 Supabase 네트워크 요청도 없다면 migration보다 먼저 브라우저 번들에 공개 Supabase 환경변수가 포함됐는지 확인한다. Node 검증은 성공하지만 브라우저만 실패하는 경우에도 build 시점 환경변수 누락을 우선 의심한다.
- Supabase 연결이 필요한 브라우저 검증에서 Auth/DB 네트워크 오류가 나면 과거 성공 기록이나 UI 추측으로 대체하지 않는다. 검증 불가로 보고한다.
- mock/dev preview는 순수 레이아웃, 빈 상태, 에러 상태, 특수 상태 확인용 보조 수단으로만 사용한다.
- mock/dev preview 결과를 로그인, 권한, RLS, 저장, DB mutation, 실제 일정관리 동작 검증으로 간주하지 않는다.
- 환경 문제로 브라우저 자동화가 막히면 production 서버와 사용자 테스트 URL을 제공하고 사용자가 직접 확인하도록 한다.
- 최종 검증에서 로그인/권한/보호 화면 흐름이 관련되면 실제 operator/student 계정 흐름과 `node scripts/verify-local-login.mjs` 같은 로컬 로그인 검증을 사용한다.
- 로그인 폼, Auth client/server action, 쿠키, role 판별, Supabase 공개 환경변수, proxy 또는 보호 layout을 변경한 작업은 production build와 서버를 같은 환경변수로 실행한 뒤 `npm run verify:login`이 통과해야 완료로 판단한다. 운영자와 학생 중 하나만 확인하거나 직접 Supabase 로그인 성공만 확인한 상태로 완료를 보고하지 않는다.
- `npm run verify:login`의 필수 성공 기준은 운영자·학생 각각의 실제 `loginWithPassword` 서버 액션 200 응답, 역할별 destination, `Set-Cookie`, 역할 API 200, 보호 화면 200 및 비인증 역할 API 401이다. 실패를 일반 lint/build 성공으로 대체하지 않는다.
- 사용자 데이터나 실제 DB 데이터를 변경하는 검증은 명시적 허용 없이 수행하지 않는다.

### 작업 중 새 문제 발견

구현 중 새로운 문제를 발견했다고 해서 항상 작업을 중단하지 않는다.

현재 작업 범위와 직접 관련되고,
지금 함께 수정하는 것이 별도로 다시 작업하는 것보다 효율적이며,
데이터 무결성이나 보안에 필요한 수정이라면 함께 처리할 수 있다.

단, 요구사항 자체를 바꾸거나 대규모 새 기능으로 확장되는 경우에는
임의 구현하지 말고 사용자에게 보고한다.

## 현재 기준점

- 기준 branch: `main`
- PR #16 merge commit: `dc69f7bc072aabf5d81399870f5469179b05d793`
- local/remote migration: 17개
- PR #16 신규 migration: 11개 (`20260826000000` ~ `20260826100000`)
- 학생 프로그램, Draft, 시간 충돌, 직원, 피드백, 보강 운영 기능 구현 완료
- 일정·보강·담당자 핵심 mutation 원자화 완료
- 다음 큰 설계 과제: 사유결석 기반 보강

현재 `main`이 이 기준보다 앞서 있다면 git history와 `docs/dev-log.md`를 먼저 확인한다.
