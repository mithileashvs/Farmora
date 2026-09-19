const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'js', 'app.js'), 'utf8');

// No browser/DOM harness is available in this test environment, so these
// are static source checks against the real file — the corresponding
// backend behavior (POST /api/accounts/signup, /login) is exercised for
// real in tests/account.test.js. Together they cover: the backend
// endpoints work correctly in isolation, AND the frontend actually calls
// them the way this test expects.

function extractBlock(sourceMarker, length = 2500) {
  const start = APP_JS.indexOf(sourceMarker);
  assert.ok(start !== -1, `could not find "${sourceMarker}" in app.js — has it been renamed/removed?`);
  return APP_JS.slice(start, start + length);
}

test('Sign Up calls the real backend (POST /api/accounts/signup) with the current anonymous userId, not just localStorage', () => {
  const block = extractBlock("apiUrl('/api/accounts/signup')");
  assert.match(block, /method:\s*'POST'/);
  assert.match(block, /userId:\s*FARMORA_USER_ID/, 'signup must send the current anonymous userId so it can be linked to this account server-side');
});

test('Login calls the real backend (POST /api/accounts/login) and restores the returned userId, not a locally-stored one', () => {
  const block = extractBlock("apiUrl('/api/accounts/login')");
  assert.match(block, /method:\s*'POST'/);
  assert.match(block, /data\.account\.userId|restoredUserId/, "login must read the account's userId from the backend response");
  assert.match(
    block,
    /localStorage\.setItem\(\s*['"]farmora_user_id['"]\s*,\s*restoredUserId\s*\)/,
    "login must restore the backend-returned userId into localStorage's farmora_user_id so the user's real farms/diagnoses/history become reachable again"
  );
});

test('Signup/login degrade gracefully rather than crashing when the backend/database is unavailable (503) or unreachable (network error)', () => {
  const block = extractBlock("apiUrl('/api/accounts/login')", 4000);
  assert.match(block, /res\.status === 503/, 'must handle a 503 (database unavailable) response explicitly');
  assert.match(block, /catch\s*\(networkErr\)/, 'must handle a network-level failure (backend unreachable) explicitly, not just HTTP error statuses');
});

test('Bug fix (still holds): logging out does not remove any account/session-restoring capability — LOGOUT_CLEARED_KEYS only clears device-local session state', () => {
  const block = extractBlock('const LOGOUT_CLEARED_KEYS');
  const arrayLiteral = block.slice(0, block.indexOf('];') + 2);
  assert.doesNotMatch(arrayLiteral, /'farmora_account'/, 'farmora_account is no longer used by signup/login and should not be referenced here');
  ['farmora_user_id', 'farmora_active_farm_id', 'farmora_name', 'farmora_crop', 'farmora_location', 'farmora_onboarded'].forEach((key) => {
    assert.match(arrayLiteral, new RegExp(`'${key}'`), `expected LOGOUT_CLEARED_KEYS to still clear '${key}'`);
  });
});

test('readErrorMessage handles both the Phase 1 string-error shape and the Phase 2/3 {code,message} object shape (regression: used to stringify to "[object Object]")', () => {
  const block = extractBlock('async function readErrorMessage', 700);
  assert.match(block, /typeof data\.error === 'string'/, 'readErrorMessage must branch on the error shape rather than assuming it is always a string');
});
