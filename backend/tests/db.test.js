const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const dns = require('dns');

test('configureMongoDns: uses MONGODB_DNS_SERVERS from env, parsed and trimmed', () => {
  // Force a fresh require with a custom env var, since db.js reads env.js
  // (which reads process.env) at module-load time.
  process.env.MONGODB_DNS_SERVERS = ' 1.1.1.1 , 1.0.0.1 ,, ';
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];

  const setServersMock = mock.method(dns, 'setServers', () => {});
  const { configureMongoDns } = require('../src/config/db');

  configureMongoDns();

  assert.equal(setServersMock.mock.callCount(), 1);
  assert.deepEqual(setServersMock.mock.calls[0].arguments[0], ['1.1.1.1', '1.0.0.1']);

  setServersMock.mock.restore();
  delete process.env.MONGODB_DNS_SERVERS;
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
});

test('configureMongoDns: defaults to Google Public DNS (8.8.8.8, 8.8.4.4) when MONGODB_DNS_SERVERS is unset', () => {
  delete process.env.MONGODB_DNS_SERVERS;
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];

  const setServersMock = mock.method(dns, 'setServers', () => {});
  const { configureMongoDns } = require('../src/config/db');

  configureMongoDns();

  assert.deepEqual(setServersMock.mock.calls[0].arguments[0], ['8.8.8.8', '8.8.4.4']);

  setServersMock.mock.restore();
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
});

test('configureMongoDns: only calls dns.setServers once even if called multiple times (idempotent)', () => {
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];

  const setServersMock = mock.method(dns, 'setServers', () => {});
  const { configureMongoDns } = require('../src/config/db');

  configureMongoDns();
  configureMongoDns();
  configureMongoDns();

  assert.equal(setServersMock.mock.callCount(), 1);

  setServersMock.mock.restore();
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
});

test('configureMongoDns: never throws even if dns.setServers throws (e.g. invalid IP format)', () => {
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];

  const setServersMock = mock.method(dns, 'setServers', () => {
    throw new Error('simulated invalid server address');
  });
  const { configureMongoDns } = require('../src/config/db');

  assert.doesNotThrow(() => configureMongoDns());

  setServersMock.mock.restore();
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
});

test('connectDb: with no MONGODB_URI, returns null and never calls dns.setServers (nothing to resolve)', async () => {
  delete process.env.MONGODB_URI;
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];

  const setServersMock = mock.method(dns, 'setServers', () => {});
  const { connectDb, isConnected } = require('../src/config/db');

  const result = await connectDb();

  assert.equal(result, null);
  assert.equal(isConnected(), false);
  assert.equal(setServersMock.mock.callCount(), 0);

  setServersMock.mock.restore();
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
});

test('connectDb: never logs the MongoDB URI/credentials, only a safe DNS-servers message', async () => {
  process.env.MONGODB_URI = 'mongodb+srv://someuser:supersecretpassword@cluster0.2leafur.mongodb.net/farmora';
  process.env.MONGODB_DNS_SERVERS = '8.8.8.8,8.8.4.4';
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];

  const setServersMock = mock.method(dns, 'setServers', () => {});
  const mongoose = require('mongoose');
  // Avoid a real (slow, network-dependent) connection attempt in this test —
  // we're only checking log safety here, not live connectivity.
  const connectMock = mock.method(mongoose, 'connect', () =>
    Promise.reject(new Error('simulated: server selection timed out'))
  );
  const logs = [];
  const logMock = mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  const errorLogs = [];
  const errorMock = mock.method(console, 'error', (...args) => errorLogs.push(args.join(' ')));

  const { connectDb } = require('../src/config/db');
  await connectDb();

  logMock.mock.restore();
  errorMock.mock.restore();
  setServersMock.mock.restore();
  connectMock.mock.restore();

  const allLogs = [...logs, ...errorLogs].join('\n');
  assert.ok(!allLogs.includes('supersecretpassword'), 'MongoDB password leaked into logs!');
  assert.ok(!allLogs.includes('someuser'), 'MongoDB username leaked into logs!');

  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DNS_SERVERS;
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/config/db')];
});
