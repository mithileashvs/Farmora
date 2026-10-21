const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../src/server');

const ALLOWED_PROD_ORIGIN = 'https://farmora-rust.vercel.app';
const ALLOWED_LOCAL_ORIGIN_5000 = 'http://localhost:5000';
const ALLOWED_LOCAL_ORIGIN_3000 = 'http://localhost:3000';
const DISALLOWED_ORIGIN = 'https://evil-unauthorized-site.com';

/* ---------------- PREFLIGHT (OPTIONS) ---------------- */

test('OPTIONS /api/chat succeeds (204) with correct CORS headers for production frontend origin', async () => {
  const res = await request(app)
    .options('/api/chat')
    .set('Origin', ALLOWED_PROD_ORIGIN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type');

  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
  assert.match(res.headers['access-control-allow-methods'], /POST/);
  assert.match(res.headers['access-control-allow-headers'], /Content-Type/i);
});

test('OPTIONS /api/accounts/login succeeds (204) with CORS headers for production frontend origin', async () => {
  const res = await request(app)
    .options('/api/accounts/login')
    .set('Origin', ALLOWED_PROD_ORIGIN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type');

  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
});

test('OPTIONS /api/users/some-valid-user-id succeeds (204) with CORS headers', async () => {
  const res = await request(app)
    .options('/api/users/123e4567-e89b-12d3-a456-426614174000')
    .set('Origin', ALLOWED_PROD_ORIGIN)
    .set('Access-Control-Request-Method', 'GET');

  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
});

/* ---------------- ALLOWED ORIGINS (GET / POST) ---------------- */

test('GET /api/health allows production frontend origin and sets Access-Control-Allow-Origin', async () => {
  const res = await request(app)
    .get('/api/health')
    .set('Origin', ALLOWED_PROD_ORIGIN);

  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
});

test('GET /api/health allows localhost:5000 and localhost:3000 origins', async () => {
  const res5000 = await request(app)
    .get('/api/health')
    .set('Origin', ALLOWED_LOCAL_ORIGIN_5000);
  assert.equal(res5000.status, 200);
  assert.equal(res5000.headers['access-control-allow-origin'], ALLOWED_LOCAL_ORIGIN_5000);

  const res3000 = await request(app)
    .get('/api/health')
    .set('Origin', ALLOWED_LOCAL_ORIGIN_3000);
  assert.equal(res3000.status, 200);
  assert.equal(res3000.headers['access-control-allow-origin'], ALLOWED_LOCAL_ORIGIN_3000);
});

test('Requests without Origin header (same-origin, curl, server-to-server) are permitted', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
});

/* ---------------- ERROR RESPONSES RETAIN CORS HEADERS ---------------- */

test('400 Validation error on POST /api/chat still returns Access-Control-Allow-Origin for allowed origin', async () => {
  const res = await request(app)
    .post('/api/chat')
    .set('Origin', ALLOWED_PROD_ORIGIN)
    .send({ message: '' }); // empty message triggers 400

  assert.equal(res.status, 400);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
  assert.equal(res.body.success, false);
});

test('400 Validation error on GET /api/users/:userId (too short) returns CORS headers', async () => {
  const res = await request(app)
    .get('/api/users/short')
    .set('Origin', ALLOWED_PROD_ORIGIN);

  assert.equal(res.status, 400);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('400 Validation error on POST /api/accounts/login (missing phone/password) returns CORS headers', async () => {
  const res = await request(app)
    .post('/api/accounts/login')
    .set('Origin', ALLOWED_PROD_ORIGIN)
    .send({});

  assert.equal(res.status, 400);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_PROD_ORIGIN);
  assert.equal(res.body.success, false);
});

/* ---------------- DISALLOWED ORIGIN REJECTION ---------------- */

test('Preflight OPTIONS from unauthorized origin is rejected safely', async () => {
  const res = await request(app)
    .options('/api/chat')
    .set('Origin', DISALLOWED_ORIGIN)
    .set('Access-Control-Request-Method', 'POST');

  assert.equal(res.status, 403);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('POST /api/chat from unauthorized origin is rejected safely with 403', async () => {
  const res = await request(app)
    .post('/api/chat')
    .set('Origin', DISALLOWED_ORIGIN)
    .send({ message: 'Hello' });

  assert.equal(res.status, 403);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});
