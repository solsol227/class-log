import nextEnv from '@next/env';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import assert from 'node:assert/strict';
import { studentNicknameToAuthEmail } from '../src/lib/auth/student-identity.ts';
nextEnv.loadEnvConfig(process.cwd());
const test = parseEnv(readFileSync('.env.rls-test.local', 'utf8'));
const baseUrl = process.env.CLASSLOG_TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const require = createRequire(import.meta.url);
const { encodeReply } = require('next/dist/compiled/react-server-dom-webpack/client.node');

async function verifyLoginAction(mode, identifier, password, destination) {
  const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
  const action = Object.entries(manifest.node).find(([, value]) => value.exportedName === 'loginWithPassword');
  assert(action, 'loginWithPassword server action was not found in the production build');

  const response = await fetch(`${baseUrl}/login/${mode}`, {
    method: 'POST',
    headers: { Accept: 'text/x-component', 'Next-Action': action[0] },
    body: await encodeReply([mode, identifier, password]),
  });
  const body = await response.text();
  assert.equal(response.status, 200, `${mode} login action returned ${response.status}`);
  assert(body.includes('"status":"success"'), `${mode} login action did not return success`);
  assert(body.includes(`"destination":"${destination}"`), `${mode} login action returned an unexpected destination`);
  assert(response.headers.has('set-cookie'), `${mode} login action did not set an auth cookie`);
  console.log(mode, 'login action PASS 200 + cookie');
}
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
      const goals = await server.from('students').select('id, goal').limit(1);
      assert.ifError(goals.error);
      const profileProbe = {
        target_student_id: '00000000-0000-4000-8000-000000000000',
        profile_nickname: 'permission-probe',
        profile_gender: null,
        profile_age: null,
        profile_phone: null,
        profile_acquisition_source: null,
        profile_joined_month: null,
        profile_special_notes: null,
        profile_goal: null,
      };
      const ownerGoalProbe = await server.rpc('save_student_profile', profileProbe);
      assert.equal(ownerGoalProbe.error?.code, 'P0002', 'owner profile RPC must reach the missing-row guard');
      const goalLengthProbe = await server.rpc('save_student_profile', { ...profileProbe, profile_goal: 'x'.repeat(1001) });
      assert.equal(goalLengthProbe.error?.code, '23514', 'deployed profile RPC must enforce the goal length');
    }
    const paths = ['/api/auth/role', destination];
    if (mode === 'operator') paths.push('/operator/students');
    if (mode === 'student') {
      const profile = await server.from('students').select('id, goal');
      assert.ifError(profile.error);
      assert.equal(profile.data?.length, 1, 'student must see exactly one own profile row');
      const deniedGoalUpdate = await server.rpc('save_student_profile', {
        target_student_id: '00000000-0000-4000-8000-000000000000', profile_nickname: 'permission-probe',
        profile_gender: null, profile_age: null, profile_phone: null, profile_acquisition_source: null,
        profile_joined_month: null, profile_special_notes: null, profile_goal: null,
      });
      assert.equal(deniedGoalUpdate.error?.code, '42501', 'student profile RPC must be denied before row lookup');
      const goalLengthProbe = await server.rpc('update_my_student_goal', { new_goal: 'x'.repeat(1001) });
      assert.equal(goalLengthProbe.error?.code, '23514', 'student goal RPC must reject an oversized goal without changing data');
      const lessons = await server.from('lessons').select('id, status').order('starts_at').limit(1);
      assert.ifError(lessons.error);
      assert((lessons.data ?? []).every((lesson) => lesson.status !== 'draft'), 'student lesson query exposed a Draft lesson');
      paths.push('/student/feedback');
      if (lessons.data?.[0]) paths.push(`/student/schedule/${lessons.data[0].id}?returnTo=%2Fstudent%2Ffeedback%3Frange%3Dall%26sort%3Ddesc`);
    }
    for (const path of paths) {
      const result = await fetch(baseUrl + path, {
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
        if (path === '/student/schedule') {
          assert(html.includes('내 목표'), 'student schedule did not render the goal dashboard');
          assert(html.includes('나만의 목표를 설정해볼까요?'), 'student goal input did not render the empty-state placeholder');
          assert(html.includes('name="goal"'), 'student goal input was not rendered');
        }
        if (path === '/student/feedback') {
          assert(!html.includes('type="date"'), 'student feedback still rendered direct date inputs');
          assert(!html.includes('기간 적용'), 'student feedback still rendered the range submit button');
          assert(!html.includes('정렬 적용'), 'student feedback still rendered the sort submit button');
        }
      }
      console.log(mode, path, 'PASS 200');
    }
  } finally {
    await client.auth.signOut({ scope: 'local' });
  }
}
async function main() {
  await verifyLoginAction('operator', test.CLASSLOG_RLS_OPERATOR_EMAIL, test.CLASSLOG_RLS_OPERATOR_PASSWORD, '/operator/schedules');
  await verifyLoginAction('student', test.CLASSLOG_RLS_STUDENT_NICKNAME, test.CLASSLOG_RLS_STUDENT_PASSWORD, '/student/schedule');
  await verify('operator', test.CLASSLOG_RLS_OPERATOR_EMAIL, test.CLASSLOG_RLS_OPERATOR_PASSWORD, '/operator/schedules');
  await verify('student', studentNicknameToAuthEmail(test.CLASSLOG_RLS_STUDENT_NICKNAME), test.CLASSLOG_RLS_STUDENT_PASSWORD, '/student/schedule');
  const unauthenticated = await fetch(baseUrl + '/api/auth/role', { method: 'POST' });
  assert.equal(unauthenticated.status, 401);
  console.log('Unauthenticated role request: PASS 401');
}
main().catch(e => { console.error(e.name, e.message); process.exitCode = 1; });
