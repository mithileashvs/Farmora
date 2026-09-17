const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');

const dbConfig = require('../src/config/db');
const User = require('../src/models/User');
const Farm = require('../src/models/Farm');
const { understandQuery } = require('../src/rag/retrieval/query');

const FARM_CONTEXT_PATH = require.resolve('../src/services/farmContext.service');

// farmContext.service.js does `const { isConnected } = require('../config/db')`
// at its own module top level, so mocking dbConfig.isConnected only takes
// effect for code that re-reads it — hence re-requiring the service fresh
// (after the mock is in place) on every test, the same way tests/db.test.js
// does for config/db itself.
function freshBuildFarmerContext() {
  delete require.cache[FARM_CONTEXT_PATH];
  return require('../src/services/farmContext.service').buildFarmerContext;
}

function restoreAll(...mocks) {
  mocks.forEach((m) => m.mock.restore());
}

/* ---------------- buildFarmerContext now returns structured crop info ---------------- */

test('buildFarmerContext: returns the farmer\'s saved primaryCrop as structured `crop` (not just prose)', async () => {
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);
  const userFindMock = mock.method(User, 'findOne', async () => ({
    location: { name: 'Trichy, Tamil Nadu' },
    language: 'ta-IN',
    primaryCrop: 'Tomato',
  }));
  const farmFindMock = mock.method(Farm, 'findOne', async () => null);

  const buildFarmerContext = freshBuildFarmerContext();
  const context = await buildFarmerContext('some-anon-user-id-123', null);

  restoreAll(isConnectedMock, userFindMock, farmFindMock);

  assert.equal(context.crop, 'Tomato');
  assert.match(context.text, /Primary crop: Tomato/);
  assert.match(context.text, /Trichy/);
});

test('buildFarmerContext: an active farm crop takes priority over the profile\'s general primaryCrop', async () => {
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);
  const userFindMock = mock.method(User, 'findOne', async () => ({
    location: { name: 'Trichy' }, language: 'en-IN', primaryCrop: 'Paddy',
  }));
  const farmFindMock = mock.method(Farm, 'findOne', async () => ({
    areaAcres: 2,
    soilType: 'Clay loam',
    irrigationType: 'Canal',
    crops: [
      { name: 'Tomato', variety: 'Hybrid-1', status: 'sown' },
      { name: 'Old Paddy', status: 'harvested' }, // should NOT be picked (not growing/sown)
    ],
  }));

  const buildFarmerContext = freshBuildFarmerContext();
  const context = await buildFarmerContext('some-anon-user-id-123', 'farm-id-abc');

  restoreAll(isConnectedMock, userFindMock, farmFindMock);

  assert.equal(context.crop, 'Tomato'); // farm's active crop, not the profile's "Paddy"
  assert.equal(context.variety, 'Hybrid-1');
  assert.equal(context.soilType, 'Clay loam');
  assert.equal(context.irrigationType, 'Canal');
  assert.match(context.text, /Current crop: Tomato \(Hybrid-1\)/);
});

test('buildFarmerContext: no userId returns an empty context (RAG must still work without farmer context)', async () => {
  const buildFarmerContext = freshBuildFarmerContext();
  const context = await buildFarmerContext(null, null);
  assert.deepEqual(context, { text: '', crop: '', variety: '', soilType: '', irrigationType: '', location: '', language: '' });
});

test('buildFarmerContext: MongoDB unavailable returns an empty context rather than throwing', async () => {
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => false);
  const buildFarmerContext = freshBuildFarmerContext();
  const context = await buildFarmerContext('some-anon-user-id-123', null);
  isConnectedMock.mock.restore();
  assert.equal(context.crop, '');
  assert.equal(context.text, '');
});

test('buildFarmerContext: a database error degrades to an empty context instead of throwing (never breaks chat/analyze)', async () => {
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);
  const userFindMock = mock.method(User, 'findOne', async () => {
    throw new Error('simulated database error');
  });
  const farmFindMock = mock.method(Farm, 'findOne', async () => null);

  const buildFarmerContext = freshBuildFarmerContext();
  const context = await buildFarmerContext('some-anon-user-id-123', null);

  restoreAll(isConnectedMock, userFindMock, farmFindMock);

  assert.equal(context.crop, '');
  assert.equal(context.text, '');
});

test('buildFarmerContext: does not leak one user\'s farm when only a different user owns it (ownership check preserved)', async () => {
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);
  const userFindMock = mock.method(User, 'findOne', async () => ({ language: 'en-IN' }));
  // Farm.findOne is always called with { _id: farmId, userId } together —
  // verify the controller-level contract by inspecting call arguments.
  const farmFindMock = mock.method(Farm, 'findOne', async (query) => {
    assert.ok(Object.prototype.hasOwnProperty.call(query, 'userId'), 'Farm lookup must filter by userId (ownership)');
    assert.ok(Object.prototype.hasOwnProperty.call(query, '_id'), 'Farm lookup must filter by _id');
    return null; // simulates: farmId exists, but belongs to a different user
  });

  const buildFarmerContext = freshBuildFarmerContext();
  const context = await buildFarmerContext('user-A', 'farm-owned-by-user-B');

  restoreAll(isConnectedMock, userFindMock, farmFindMock);

  assert.equal(context.crop, ''); // no farm data leaked
});

/* ---------------- End-to-end: farmer crop reaches RAG query understanding (Fix 3) ---------------- */

test('Fix 3 end-to-end: farmer\'s saved crop reaches RAG retrieval when the request itself names no crop', async () => {
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);
  const userFindMock = mock.method(User, 'findOne', async () => ({ language: 'en-IN', primaryCrop: 'Groundnut' }));
  const farmFindMock = mock.method(Farm, 'findOne', async () => null);

  // Step 1: this is exactly what chat.controller.js now does.
  const buildFarmerContext = freshBuildFarmerContext();
  const farmerContext = await buildFarmerContext('some-anon-user-id-123', null);
  restoreAll(isConnectedMock, userFindMock, farmFindMock);

  assert.equal(farmerContext.crop, 'Groundnut');

  // Step 2: this is exactly what rag.service.js's retrieveForQuery() does
  // internally with the farmerCrop it's now given.
  const queryResult = understandQuery({
    message: 'My leaves have brown spots, what should I do?',
    mode: 'general',
    crop: undefined, // request itself names no crop — the whole point of Fix 3
    farmerCrop: farmerContext.crop,
  });

  assert.equal(queryResult.crop, 'groundnut', 'farmer\'s saved crop should reach query understanding when the request names none');
});

test('Fix 3: an explicit crop in the request still takes priority over the farmer\'s saved crop', () => {
  const queryResult = understandQuery({
    message: 'What should I check?',
    crop: 'Cotton', // explicitly named in this request
    farmerCrop: 'Groundnut', // farmer's saved profile crop
  });
  assert.equal(queryResult.crop, 'cotton');
});

test('Fix 3: RAG retrieval still proceeds normally with no farmer context at all (RAG must not depend on it)', () => {
  const queryResult = understandQuery({
    message: 'What fertilizer should I use for tomato?',
    farmerCrop: undefined,
  });
  assert.equal(queryResult.crop, 'tomato'); // detected straight from the message
  assert.ok(queryResult.retrievalText.length > 0);
});
