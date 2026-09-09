import nextEnv from '@next/env';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import assert from 'node:assert/strict';
import { studentNicknameToAuthEmail } from '../src/lib/auth/student-identity.ts';
nextEnv.loadEnvConfig(process.cwd());
const test = parseEnv(readFileSync('.env.rls-test.local', 'utf8'));
async function verify(mode, email, password, destination) {
  const jar = new Map();
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)),
  };
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies, isSingleton: false });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  console.log(mode, 'signIn', { success: !!data.session, code: error?.code, cookieCount: jar.size });
  assert.ifError(error);
  try {
    const server = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies });
    const verified = await server.auth.getClaims();
    assert(verified.data?.claims);
    if (mode === 'operator') {
      const context = await server.rpc('get_my_operator_context');
      console.log(mode, 'context', { success: !context.error && !!context.data, code: context.error?.code });
      assert.ifError(context.error);
      assert.equal(context.data?.accessLevel, 'owner');
    }
    for (const path of ['/api/auth/role', destination]) {
      const result = await fetch('http://127.0.0.1:3000' + path, {
        method: path.startsWith('/api') ? 'POST' : 'GET', redirect: 'manual',
        headers: { Cookie: [...jar].map(([n,v]) => n + '=' + v).join('; '), 'Content-Type': 'application/json' },
        ...(path.startsWith('/api') ? { body: JSON.stringify({ expectedRole: mode }) } : {}),
      });
      assert.equal(result.status, 200, `${mode} ${path}: ${result.headers.get('location') ?? result.status}`);
      if (path.startsWith('/api')) assert.equal((await result.json()).destination, destination);
      else {
        const html = await result.text();
        assert(!html.includes('로그인 시간이 만료되었습니다'));
        if (mode === 'student') assert(!html.includes(' · Draft '));
      }
      console.log(mode, path, 'PASS 200');
    }
  } finally {
    await client.auth.signOut({ scope: 'local' });
  }
}
async function main() {
  await verify('operator', test.CLASSLOG_RLS_OPERATOR_EMAIL, test.CLASSLOG_RLS_OPERATOR_PASSWORD, '/operator/schedules');
  await verify('student', studentNicknameToAuthEmail(test.CLASSLOG_RLS_STUDENT_NICKNAME), test.CLASSLOG_RLS_STUDENT_PASSWORD, '/student/schedule');
  const unauthenticated = await fetch('http://127.0.0.1:3000/api/auth/role', { method: 'POST' });
  assert.equal(unauthenticated.status, 401);
  console.log('Unauthenticated role request: PASS 401');
}
main().catch(e => { console.error(e.name, e.message); process.exitCode = 1; });
