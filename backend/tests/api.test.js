const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../src/server');

test('GET /api/health returns ok status with database field', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'farmora-backend');
  // No MONGODB_URI is set in the test environment, so the database is
  // reported as not configured rather than "down" — chat/analyze still work.
  assert.equal(res.body.database, 'not_configured');
});

test('POST /api/chat rejects an empty message with 400 (no Groq call needed)', async () => {
  const res = await request(app).post('/api/chat').send({ message: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Invalid request.');
});

test('POST /api/chat rejects a too-long message with 400', async () => {
  const res = await request(app)
    .post('/api/chat')
    .send({ message: 'a'.repeat(2001) });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/analyze rejects a request with no images', async () => {
  const res = await request(app).post('/api/analyze').field('message', 'what is this');
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/analyze rejects an unsupported file type', async () => {
  const res = await request(app)
    .post('/api/analyze')
    .field('mode', 'leaf')
    .attach('images', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('unknown route returns JSON 404', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

// NOTE: A successful /api/chat or /api/analyze call (one that actually reaches
// Groq) is NOT covered here because it requires a real GROQ_API_KEY and a live
// network call. This was verified manually — see README.md "Testing" section
// for what was and wasn't live-tested.
