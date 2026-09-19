const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../src/server');
const { hashPassword, verifyPassword } = require('../src/utils/password');

/* ---------------- password hashing ---------------- */

test('hashPassword/verifyPassword: correct password verifies, wrong password does not', () => {
  const stored = hashPassword('correct-horse-battery-staple');
  assert.equal(verifyPassword('correct-horse-battery-staple', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('hashPassword: never stores the plain password, and two hashes of the same password differ (random salt)', () => {
  const a = hashPassword('same-password');
  const b = hashPassword('same-password');
  assert.notEqual(a, 'same-password');
  assert.notEqual(b, 'same-password');
  assert.notEqual(a, b, 'expected different salts to produce different stored hashes');
});

test('verifyPassword: malformed/missing stored value never throws, just fails closed', () => {
  assert.equal(verifyPassword('anything', null), false);
  assert.equal(verifyPassword('anything', ''), false);
  assert.equal(verifyPassword('anything', 'not-a-valid-format'), false);
});

/* ---------------- validation (no live MongoDB needed — same pattern as tests/phase2.test.js) ---------------- */

test('POST /api/accounts/signup rejects a missing password with 400 VALIDATION_ERROR', async () => {
  const res = await request(app).post('/api/accounts/signup').send({ name: 'Ramesh', phone: '9876543210' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/accounts/signup rejects a too-short password with 400', async () => {
  const res = await request(app).post('/api/accounts/signup').send({ name: 'Ramesh', phone: '9876543210', password: 'abc' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/accounts/signup rejects an invalid phone number with 400', async () => {
  const res = await request(app).post('/api/accounts/signup').send({ name: 'Ramesh', phone: 'not-a-phone!!', password: 'password123' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/accounts/login rejects a missing phone with 400', async () => {
  const res = await request(app).post('/api/accounts/login').send({ password: 'password123' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

/* ---------------- graceful degradation when MongoDB is unavailable ---------------- */

test('POST /api/accounts/signup returns 503 DATABASE_UNAVAILABLE when Mongo is down (valid body)', async () => {
  const res = await request(app)
    .post('/api/accounts/signup')
    .send({ name: 'Ramesh', phone: '9876543210', password: 'password123' });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

test('POST /api/accounts/login returns 503 DATABASE_UNAVAILABLE when Mongo is down (valid body)', async () => {
  const res = await request(app)
    .post('/api/accounts/login')
    .send({ phone: '9876543210', password: 'password123' });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
});

/* ---------------- response shape never leaks the password/hash ---------------- */

test('signup/login responses never include passwordHash or the plain password, even in error paths', async () => {
  const res1 = await request(app).post('/api/accounts/signup').send({ name: 'Ramesh', phone: '9876543210', password: 'password123' });
  const res2 = await request(app).post('/api/accounts/login').send({ phone: '9876543210', password: 'password123' });
  [res1, res2].forEach((res) => {
    const body = JSON.stringify(res.body);
    assert.doesNotMatch(body, /passwordHash/);
    assert.doesNotMatch(body, /password123/);
  });
});
