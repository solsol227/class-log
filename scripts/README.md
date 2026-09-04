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
