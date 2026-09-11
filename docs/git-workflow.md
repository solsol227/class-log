# Class Log Git 워크플로우

## 기본 브랜치

`main`을 기준 브랜치로 사용한다.

기능/수정 작업은 `main`에서 새 브랜치를 만들어 진행한다.

`main`에 직접 기능 구현 커밋을 만들지 않는다.

---

# 1. 작업 시작

```bash
git status
git checkout main
git pull origin main
git status
```

working tree가 clean이고 `main`이 최신인지 확인한다.

그다음 작업 브랜치를 만든다.

예:

```bash
git checkout -b feat/data-model-improvements
```

보안 수정 예:

```text
fix/supabase-security-lints
```

브랜치명은 `feat/`, `fix/`, `docs/` 등 작업 성격이 드러나게 한다.

---

# 2. Migration 규칙

이미 적용된 migration은 수정하지 않는다.

DB 변경은 항상 새 migration을 추가한다.

**append-only를 기본 원칙으로 한다.**

migration 전에는:

- 로컬 migration 목록
- 원격 migration 목록
- 적용 순서
- 실제 기존 데이터

를 확인한다.

DB 관련 세부 규칙은:

`docs/compound/supabase-migrations.md`

를 따른다.

---

# 3. 커밋

한 커밋은 가능하면 하나의 의미 있는 작업 단위로 만든다.

예:

```text
학생 프로그램 데이터 모델 추가
Draft 일정 RLS 적용
피드백 댓글 구조 추가
```

커밋 전:

```bash
git status
git diff --check
```

를 확인한다.

의도하지 않은 파일을 무조건 한꺼번에 add하지 않는다.

---

# 4. 검증

기능 단위 구현이 끝나면 먼저 자동 수정 가능한 ESLint 문제를 정리한다.

```bash
npm run lint:fix
```

자동 수정 diff를 확인한 뒤, 같은 코드 기준으로 다음 세 검사를 병렬 실행한다. 하나가 실패해도 다른 검사를 중단하지 않고 결과를 모두 수집한다.

```bash
npm run lint
npm run typecheck
git diff --check
```

세 검사가 모두 종료된 뒤 production build를 실행한다.

```bash
npm run build
```

`lint:fix`는 파일을 변경하므로 검사들과 동시에 실행하지 않는다. TypeScript 검사와 production build는 `.next` 생성 타입을 함께 다룰 수 있어 서로 겹쳐 실행하지 않는다. 작은 수정마다 전체 절차를 반복하지 않고, 기능 단위 완료와 Git 마무리 시점에 최신 코드 기준 결과를 확인한다.

Supabase schema 변경 시:

```bash
supabase db lint
```

도 실행한다.

RLS/DB 변경은 lint만으로 끝내지 않고 실제 operator/student 시나리오를 확인한다.

로그인, Auth, 쿠키, 역할 판별, Supabase 공개 환경변수 또는 보호 화면 경계를 변경했다면 production 서버를 실행한 상태에서 다음 검사를 반드시 통과시킨다.

```bash
npm run verify:login
```

이 검사는 실제 테스트 운영자·학생의 로그인 서버 액션, 인증 쿠키, 역할별 이동, 역할 API, 보호 화면과 비인증 거부를 함께 검증한다. 한 역할만 성공하거나 Supabase SDK 직접 로그인만 성공한 결과로 대체하지 않는다.

---

# 5. PR

작업 완료 후 원격 브랜치에 push하고 `main` 대상 PR을 만든다.

PR에는 최소 다음을 적는다.

- 무엇을 변경했는지
- 왜 변경했는지
- schema/migration 영향
- 기존 데이터 backfill 여부
- RLS 영향
- 테스트 결과
- 후속으로 남긴 것

---

# 6. main이 작업 중 앞서간 경우

먼저 현재 변경 상태를 안전하게 정리한다.

그 후 최신 `main`을 작업 브랜치에 반영한다.

초보자 운영 기준으로 이해하기 어려운 history rewrite를 기본 선택으로 하지 않는다.

충돌이 발생하면 실제 의미를 확인한 뒤 해결한다.

---

# 7. 위험한 명령

다음은 사용자의 명시적 지시 없이 실행하지 않는다.

- `git push --force`
- `git reset --hard`
- 대량 파일 삭제
- 이미 적용된 migration history 재작성
- main의 기존 이력 변경

---

# 8. 작업 종료

PR/병합 이후에는:

- main 최신화
- working tree 확인
- migration local/remote 동기화 확인
- `docs/dev-log.md`에 결과 기록

을 한다.

---

# 문서 PR

큰 기능 PR merge 후 문서가 뒤처졌다면 별도 `docs/...` 브랜치에서 실제 main 기준으로 동기화한다.
문서 전용 PR에서는 기능 코드나 migration을 함께 수정하지 않는다.
