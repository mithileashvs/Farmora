const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../src/server');

// NOTE: No MONGODB_URI is set in this test environment (see backend/.env.example —
// MongoDB is optional), so every database-backed route below is exercised in its
// "database unavailable" state. This is intentional per the Phase 2 requirement
// that the app must degrade gracefully rather than crash, and it lets us verify
// that behavior without requiring a live MongoDB instance for basic unit tests.
//
// Validation middleware runs BEFORE the database check in every Phase 2 route,
// so malformed requests still get a clean 400 even though the database is down —
// that ordering is what the tests below actually verify.

const VALID_USER_ID = 'test-anon-user-id-0001';

/* ---------------- USERS ---------------- */

test('POST /api/users rejects a missing userId with 400 VALIDATION_ERROR', async () => {
  const res = await request(app).post('/api/users').send({ name: 'Ramesh' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/users rejects an invalid language with 400', async () => {
  const res = await request(app)
    .post('/api/users')
    .send({ userId: VALID_USER_ID, language: 'fr-FR' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/users returns 503 DATABASE_UNAVAILABLE when Mongo is down (valid body)', async () => {
  const res = await request(app)
    .post('/api/users')
    .send({ userId: VALID_USER_ID, name: 'Ramesh', language: 'ta-IN', primaryCrop: 'Paddy' });
  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

test('GET /api/users/:userId rejects a too-short userId with 400', async () => {
  const res = await request(app).get('/api/users/short');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/users/:userId rejects unexpected fields with 400 (no arbitrary field writes)', async () => {
  const res = await request(app)
    .patch(`/api/users/${VALID_USER_ID}`)
    .send({ isAdmin: true });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

/* ---------------- FARMS ---------------- */

test('POST /api/farms rejects a request with no farm name with 400', async () => {
  const res = await request(app).post('/api/farms').send({ userId: VALID_USER_ID });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/farms returns 503 when Mongo is down (valid body)', async () => {
  const res = await request(app)
    .post('/api/farms')
    .send({ userId: VALID_USER_ID, name: 'North Field', areaAcres: 2 });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

test('GET /api/farms/:userId/:farmId rejects a malformed farmId with 400', async () => {
  const res = await request(app).get(`/api/farms/${VALID_USER_ID}/not-a-valid-id`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/farms/:userId/:farmId/crops rejects a missing crop name with 400', async () => {
  const fakeFarmId = '507f1f77bcf86cd799439011';
  const res = await request(app)
    .post(`/api/farms/${VALID_USER_ID}/${fakeFarmId}/crops`)
    .send({ variety: 'IR20' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/farms/:userId/:farmId/crops returns 503 when Mongo is down (valid body)', async () => {
  const fakeFarmId = '507f1f77bcf86cd799439011';
  const res = await request(app)
    .post(`/api/farms/${VALID_USER_ID}/${fakeFarmId}/crops`)
    .send({ name: 'Paddy', status: 'sown' });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

/* ---------------- DIAGNOSES ---------------- */

test('GET /api/diagnoses/:userId rejects an excessive limit with 400', async () => {
  const res = await request(app).get(`/api/diagnoses/${VALID_USER_ID}?limit=999`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/diagnoses/:userId returns 503 when Mongo is down (valid query)', async () => {
  const res = await request(app).get(`/api/diagnoses/${VALID_USER_ID}?page=1&limit=10`);
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

test('GET /api/diagnoses/:userId/:diagnosisId rejects a malformed diagnosisId with 400', async () => {
  const res = await request(app).get(`/api/diagnoses/${VALID_USER_ID}/not-a-valid-id`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

/* ---------------- CHATS ---------------- */

test('GET /api/chats/:userId returns 503 when Mongo is down (valid query)', async () => {
  const res = await request(app).get(`/api/chats/${VALID_USER_ID}`);
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

/* ---------------- CHAT/ANALYZE STILL WORK WITH userId PRESENT ---------------- */

test('POST /api/chat with a userId still validates message the same way (Phase 1 behavior preserved)', async () => {
  const res = await request(app).post('/api/chat').send({ message: '', userId: VALID_USER_ID });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Invalid request.');
});

test('POST /api/chat ignores a malformed userId rather than erroring (best-effort persistence)', async () => {
  const res = await request(app).post('/api/chat').send({ message: '', userId: 'x' });
  // Still a plain 400 about the message — a bad/short userId must never itself
  // cause a different error path, since userId here is not authentication.
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid request.');
});
