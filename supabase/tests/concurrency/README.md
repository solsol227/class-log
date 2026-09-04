# 동시 Draft 확정 / 일정 저장 회귀 검증

Supabase CLI 2.116.0과 연결된 테스트 가능 프로젝트에서 실행한다.
기존 Draft에 학생 UUID와 프로그램 UUID의 정렬 순서가 반대인 두 학생이
배정되어 있어야 한다. 두 학생은 진행 중인 월간 이용권과 남은 횟수가 필요하다.
실행 중에는 해당 학생·일정의 운영 작업을 잠시 멈춘다.

```powershell
$env:SUPABASE_CLI = '설치된 Supabase CLI 실행파일의 절대 경로'
node supabase/tests/concurrency/run.mjs
```

`save.sql`은 학생 UUID 순서의 첫 잠금을 잡고 20초간 대기한다.
별도 DB 세션의 `confirm.sql`이 같은 학생들의 기존 Draft 확정을 요청한다.
`observe.sql`로 두 세션이 실제로 겹쳤고 확정 요청이 첫 잠금에서 기다리는지 확인한다.
이후 실제 두 RPC가 모두 성공해야 한다. 변경은 모두 rollback하며 일정·배정·조정
전체 row의 전후 해시도 비교한다. 요청 시간 제한은 45초, 잠금 대기는 30초다.

수정 전 함수가 설치된 별도 환경에서는 `--expect-deadlock`으로 원래 오류를
재현할 수 있다. 이 옵션을 위해 적용된 migration을 수정하거나 원격 함수를 되돌리지 않는다.

단일 배정 보존·중복 차단·학생 Draft 비노출·RPC 권한 검증:

```powershell
supabase db query --linked --file supabase/tests/20260904010000_assignment_and_draft_privacy.sql
```

이 테스트 역시 rollback만 사용하며 기존 테스트 계정 2개가 필요하다.
