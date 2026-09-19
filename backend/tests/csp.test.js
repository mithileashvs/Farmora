const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/server');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const INDEX_HTML = fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8');

const INLINE_EVENT_HANDLER_ATTRS = [
  'onclick', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onkeypress',
  'onsubmit', 'onload', 'onerror', 'ontouchstart', 'ontouchend', 'onmouseover',
  'onmouseout', 'onfocus', 'onblur', 'ondblclick',
];

test('index.html has no inline HTML event-handler attributes (onclick=, onchange=, etc.)', () => {
  for (const attr of INLINE_EVENT_HANDLER_ATTRS) {
    const pattern = new RegExp(`\\s${attr}\\s*=`, 'i');
    assert.equal(pattern.test(INDEX_HTML), false, `found inline ${attr}= attribute in index.html`);
  }
});

test('index.html contains no inline <script> block with executable JavaScript — only external <script src>', () => {
  // Matches an opening <script> tag that is NOT immediately self-closing and
  // NOT just `<script src="...">...</script>` with empty/whitespace-only body.
  const scriptTagPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let inlineBlocksFound = 0;
  while ((match = scriptTagPattern.exec(INDEX_HTML)) !== null) {
    const [, attrs, body] = match;
    const hasSrc = /\bsrc\s*=/.test(attrs);
    const bodyIsEmpty = body.trim() === '';
    if (!hasSrc && !bodyIsEmpty) inlineBlocksFound += 1;
  }
  assert.equal(inlineBlocksFound, 0, 'index.html still contains an inline <script>...</script> block with code in it');
});

test('index.html references the externalized app.js and config.js as external scripts', () => {
  assert.match(INDEX_HTML, /<script src="config\.js"><\/script>/);
  assert.match(INDEX_HTML, /<script src="js\/app\.js"><\/script>/);
});

test('frontend/js/app.js exists, is non-trivial, and has valid JavaScript syntax', () => {
  const appJsPath = path.join(FRONTEND_DIR, 'js', 'app.js');
  assert.ok(fs.existsSync(appJsPath), 'frontend/js/app.js does not exist');
  const content = fs.readFileSync(appJsPath, 'utf8');
  assert.ok(content.length > 1000, 'frontend/js/app.js looks suspiciously small/empty');
  assert.doesNotThrow(() => new Function(content), 'frontend/js/app.js has a JavaScript syntax error');
});

/* ---------------- CSP HEADER (via the real Express app) ---------------- */

test('GET / sends a Content-Security-Policy header with no unsafe-inline/unsafe-eval in script-src', async () => {
  const res = await request(app).get('/');
  const csp = res.headers['content-security-policy'];
  assert.ok(csp, 'no Content-Security-Policy header sent');

  const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
  assert.ok(scriptSrcMatch, 'no script-src directive in CSP');
  assert.doesNotMatch(scriptSrcMatch[1], /unsafe-inline/, 'script-src allows unsafe-inline');
  assert.doesNotMatch(scriptSrcMatch[1], /unsafe-eval/, 'script-src allows unsafe-eval');
  assert.match(scriptSrcMatch[1], /'self'/, "script-src should allow 'self' (external same-origin scripts)");
});

test('CSP still allows the existing (unchanged) direct-from-browser weather/geocoding calls', async () => {
  const res = await request(app).get('/');
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /connect-src[^;]*api\.open-meteo\.com/);
  assert.match(csp, /connect-src[^;]*geocoding-api\.open-meteo\.com/);
  assert.match(csp, /connect-src[^;]*nominatim\.openstreetmap\.org/);
});

test('Helmet security headers remain enabled (not disabled while fixing CSP)', async () => {
  const res = await request(app).get('/api/health');
  assert.ok(res.headers['x-content-type-options'], 'Helmet x-content-type-options header missing');
  assert.equal(res.headers['x-powered-by'], undefined, 'x-powered-by should be disabled/absent');
});

/* ---------------- STATIC FILE SERVING ---------------- */

test('GET /js/app.js is served by the backend (externalized script is reachable)', async () => {
  const res = await request(app).get('/js/app.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
});

test('GET /config.js is still served (frontend config unaffected by the CSP fix)', async () => {
  const res = await request(app).get('/config.js');
  assert.equal(res.status, 200);
});

/* ---------------- Screen-switching CSS (Chat History page fix) ---------------- */

test('#screen-chat is the only .screen element carrying an extra class, and an explicit rule hides it when inactive', () => {
  // Regression test for a real bug: #screen-chat carries both `.screen` and
  // `.chat-wrap`. Without an explicit `.chat-wrap:not(.active) { display:
  // none }` rule, an inactive #screen-chat and `.chat-wrap` land at equal
  // CSS specificity (one class each) and — because `.chat-wrap` is
  // declared later in the stylesheet — `.chat-wrap`'s `display: flex`
  // would win the tie, keeping the full chat UI visible above whatever
  // screen was actually navigated to (this is exactly what was reported
  // for the Chat History page). This test guards the fix, and also
  // confirms no other .screen element has the same extra-class hazard.
  assert.match(
    INDEX_HTML,
    /\.chat-wrap:not\(\.active\)\s*\{\s*display:\s*none;?\s*\}/,
    'missing the .chat-wrap:not(.active) rule that keeps an inactive chat screen hidden'
  );

  const screenClassAttrs = [...INDEX_HTML.matchAll(/class="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((cls) => cls.split(/\s+/).includes('screen'));
  const extraClassScreens = screenClassAttrs.filter((cls) => cls.split(/\s+/).filter((c) => c !== 'screen' && c !== 'active').length > 0);
  assert.deepEqual(
    extraClassScreens,
    ['screen active chat-wrap'],
    'a new .screen element with an extra class was added — verify it doesn\'t have the same specificity-tie hazard as chat-wrap'
  );
});

