// SUPABASE_CLI must point to the installed Supabase CLI executable.
// Uses two real DB sessions, existing eligible Drafts, and rollback-only RPCs.
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const cli = process.env.SUPABASE_CLI;
assert(cli, 'Set SUPABASE_CLI to the installed CLI executable.');
const expectDeadlock = process.argv.includes('--expect-deadlock');
function query(file) {
  return new Promise(resolve => {
    execFile(cli, ['db', 'query', '--linked', '--file', fileURLToPath(new URL(file, import.meta.url))],
      { timeout: 60000, windowsHide: true }, (error, stdout, stderr) => {
        resolve({ file, ok: !error, stdout, stderr });
      });
  });
}
async function main() {
  const before = await query('snapshot.sql');
  assert(before.ok, before.stderr);
  const save = query('save.sql');
  await delay(4000);
  const confirm = query('confirm.sql');
  await delay(5000);
  const observation = await query('observe.sql');
  assert(observation.ok, observation.stderr);
  const observed = JSON.parse(observation.stdout).rows;
  console.log('Concurrent lock observation:', JSON.stringify(observed));
  const saving = observed.find(r => r.application_name === 'class-log-concurrency-save');
  const confirming = observed.find(r => r.application_name === 'class-log-concurrency-confirm');
  assert(saving?.held_student_locks >= 1 && saving.wait_event === 'PgSleep', 'Save did not reach the controlled pause.');
  assert(confirming?.waiting_student_locks === 1, 'Confirmation was not waiting on a student lock.');
  assert.equal(confirming.held_student_locks, expectDeadlock ? 1 : 0, 'Unexpected confirmation lock order.');
  const results = await Promise.all([save, confirm]);
  for (const result of results) console.log(result.file, result.ok ? 'PASS (rolled back)' : result.stderr.trim() + result.stdout.trim());
  const after = await query('snapshot.sql');
  assert(after.ok, after.stderr);
  assert.deepEqual(JSON.parse(after.stdout).rows, JSON.parse(before.stdout).rows, 'Database rows changed during rollback tests.');
  console.log('Lessons, assignments, and allowance adjustments unchanged.');
  if (expectDeadlock) {
    assert(results.some(r => !r.ok && /deadlock detected/i.test(r.stderr + r.stdout)), 'Expected the original deadlock.');
  } else {
    assert(results.every(r => r.ok), 'Both RPCs must complete without deadlock or other errors.');
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
