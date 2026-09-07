# 로컬 로그인 검증

Node 24에서 실행한다. `.env.local`의 Supabase 주소·공개 키와 git에서 제외된
`.env.rls-test.local`의 `CLASSLOG_RLS_OPERATOR_EMAIL`,
`CLASSLOG_RLS_OPERATOR_PASSWORD`, `CLASSLOG_RLS_STUDENT_NICKNAME`,
`CLASSLOG_RLS_STUDENT_PASSWORD`를 사용한다.

Supabase Auth에 접속 가능한 환경에서 production 서버를 실행한 뒤 확인한다.

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
node scripts/verify-local-login.mjs
node --test src/lib/auth/auth-verification.test.mjs
```

첫 테스트는 실제 operator/student 로그인을 통해 브라우저 클라이언트가 만든 쿠키,
SSR 서명 검증, 로컬 역할 API, 보호 페이지 HTTP 응답 및 비인증 거부를 확인한다.
브라우저 UI 자동화는 아니며 입력·클릭 동작 자체는 검증하지 않는다.
비밀번호·토큰을 출력하지 않으며 발급한 테스트 세션만 로그아웃한다.

두 번째 테스트는 Auth 연결 실패·503·429를 주입해 세션 만료로 오인하지 않고
쿠키를 보존하는지, 유효하지 않은 JWT와 잘못된 역할은 계속 거부하는지 확인한다.

로컬 서버의 외부 네트워크가 차단되면 브라우저의 직접 로그인은 성공해도
서버의 Auth 검증은 실패할 수 있다. 서버에도 Supabase 연결을 허용해야 하며,
토큰 검증을 생략하는 방식으로 우회하지 않는다.

## PR24 격리 DB 회귀 검사

앱 package.json/lockfile 변경 없이 임시 무시 폴더에 PGlite를 설치한다.

~~~powershell
npm install --prefix .temp/pr24-validation --no-save --package-lock=false @electric-sql/pglite@0.3.14
node scripts/test-operator-ux-db.mjs
~~~

메모리 PostgreSQL만 사용하며 환경변수·원격 DB·실제 사용자 데이터를 읽지 않는다.
최소 Supabase Auth/role 플랫폼 구성을 bootstrap하고 저장소의 33개 migration을
순서대로 실행한다. 기존 migration 내 데이터 기반 검증에는 합성 학생/이용권을 사용한다.
50개 assertion으로 신규 분류 필수, 기존 NULL 수정, 다른 이용권 배정, quota/충돌,
보강 연결 불변, Draft 삭제 보호, 확정 취소, 저장 영역 분리, 프로그램 transaction/이력,
PR26 수동 완료·복구 이력·자동 완료 복구 차단, 학생 RLS와 RPC 권한을 검증한다. Supabase Auth 서비스, PostgREST schema cache,
브라우저 입력·레이아웃과 두 세션 경합은 이 테스트에 포함되지 않는다.

supabase/tests/operator_ux_preflight.sql은 별도의 읽기 전용 원격 점검 SQL이며
건수와 컬럼·trigger·RPC·RLS metadata만 조회한다.
