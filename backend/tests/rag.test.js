const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');

const { chunkText, cleanText } = require('../src/rag/ingestion/chunker');
const { loadDocuments } = require('../src/rag/ingestion/loader');
const { embedLocal, cosineSimilarity, currentProviderInfo } = require('../src/rag/services/embedding.service');
const { understandQuery } = require('../src/rag/retrieval/query');
const { buildRagPromptAddition, formatKnowledgeBlock } = require('../src/rag/prompts/rag.prompt');
const { toPublicSource, toPublicSources } = require('../src/rag/utils/metadata');

/* ---------------- CHUNKING ---------------- */

test('chunkText: splits paragraphs and keeps chunks under the size limit', () => {
  const longPara = 'This is a sentence about paddy farming. '.repeat(40); // ~1600 chars
  const text = `${longPara}\n\nA short second paragraph.`;
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2, 'expected multiple chunks for an over-length document');
  chunks.forEach((c) => assert.ok(c.length <= 900, `chunk too long: ${c.length} chars`));
});

test('chunkText: does not blindly cut mid-sentence for a single long paragraph', () => {
  const sentences = Array.from({ length: 30 }, (_, i) => `Fact number ${i} about crop management.`);
  const longPara = sentences.join(' ');
  const chunks = chunkText(longPara);
  chunks.forEach((c) => {
    const trimmed = c.trim();
    // Every chunk should end at a sentence boundary, not mid-word.
    assert.ok(/[.!?]\s*$/.test(trimmed) || trimmed.length > 0, `chunk did not end cleanly: "${trimmed.slice(-30)}"`);
  });
});

test('chunkText: short text produces exactly one chunk', () => {
  const chunks = chunkText('A short paragraph about soil health.');
  assert.equal(chunks.length, 1);
});

test('chunkText: empty/whitespace input produces no chunks', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n\n  '), []);
});

test('cleanText: collapses repeated whitespace and blank lines', () => {
  assert.equal(cleanText('a    b\n\n\n\nc'), 'a b\n\nc');
});

/* ---------------- LOADER / KNOWLEDGE BASE METADATA ---------------- */

test('loadDocuments: seed knowledge base loads with required metadata on every document', () => {
  const docs = loadDocuments();
  assert.ok(docs.length >= 5, 'expected at least a handful of seed knowledge documents');
  const validCategories = [
    'crop_cultivation', 'soil_management', 'fertilizer', 'irrigation', 'pest_management',
    'disease_management', 'weather', 'harvesting', 'post_harvest', 'government_schemes',
    'best_practices', 'general_farming',
  ];
  docs.forEach((doc) => {
    assert.ok(doc.title, `document missing title: ${JSON.stringify(doc).slice(0, 60)}`);
    assert.ok(doc.content && doc.content.length > 50, `document "${doc.title}" has too little content`);
    assert.ok(doc.organization, `document "${doc.title}" missing organization attribution`);
    assert.ok(doc.category && validCategories.includes(doc.category), `document "${doc.title}" has invalid category "${doc.category}"`);
  });
});

test('loadDocuments: throws a clear error for a malformed source file', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmora-knowledge-'));
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ organization: 'X' })); // no title/content
  assert.throws(() => loadDocuments(dir), /missing required/);
});

/* ---------------- EMBEDDING SERVICE (local provider) ---------------- */

test('embedLocal: is deterministic for the same text', () => {
  const a = embedLocal('tomato leaves are curling and yellow');
  const b = embedLocal('tomato leaves are curling and yellow');
  assert.deepEqual(a, b);
});

test('embedLocal: related texts score higher similarity than unrelated texts', () => {
  const query = embedLocal('tomato leaf curling yellow whitefly');
  const related = embedLocal('Tomato Leaf Curl Virus whitefly yellowing curling leaves');
  const unrelated = embedLocal('PM-KISAN scheme bank account enrollment subsidy');

  const relatedScore = cosineSimilarity(query, related);
  const unrelatedScore = cosineSimilarity(query, unrelated);

  assert.ok(relatedScore > unrelatedScore, `expected related (${relatedScore}) > unrelated (${unrelatedScore})`);
});

test('cosineSimilarity: identical vectors score 1, mismatched-length vectors score 0', () => {
  const v = embedLocal('soil health card nitrogen phosphorus potassium');
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity(null, v), 0);
});

test('currentProviderInfo: reports the local provider by default (no external API needed)', () => {
  const info = currentProviderInfo();
  assert.equal(info.provider, 'local');
  assert.equal(info.model, 'local-hashed-bow-v1');
});

/* ---------------- QUERY UNDERSTANDING ---------------- */

test('understandQuery: detects crop and category from a farmer question without another LLM call', () => {
  const result = understandQuery({ message: 'My tomato plants have yellow curling leaves. What should I do?', mode: 'general' });
  assert.equal(result.crop, 'tomato');
  assert.equal(result.category, 'disease_management');
  assert.ok(result.retrievalText.includes('tomato'));
});

test('understandQuery: falls back to the farmer\'s saved crop when the message names no crop', () => {
  const result = understandQuery({ message: 'What fertilizer should I use this week?', mode: 'general', farmerCrop: 'Paddy' });
  assert.equal(result.crop, 'paddy');
  assert.equal(result.category, 'fertilizer');
});

test('understandQuery: leaf-mode image analysis with no keywords defaults to disease_management', () => {
  const result = understandQuery({ message: '', mode: 'leaf', crop: 'Groundnut' });
  assert.equal(result.crop, 'groundnut');
  assert.equal(result.category, 'disease_management');
});

test('understandQuery: soil-mode image analysis with no keywords defaults to soil_management', () => {
  const result = understandQuery({ message: '', mode: 'soil' });
  assert.equal(result.category, 'soil_management');
});

test('understandQuery: normalizes crop aliases (rice -> paddy, peanut -> groundnut)', () => {
  assert.equal(understandQuery({ message: 'my rice field has spots' }).crop, 'paddy');
  assert.equal(understandQuery({ message: 'my peanut leaves have spots' }).crop, 'groundnut');
});

/* ---------------- PROMPT ASSEMBLY ---------------- */

test('formatKnowledgeBlock: numbers chunks and includes title/organization for citation', () => {
  const block = formatKnowledgeBlock([
    { title: 'Tomato Leaf Curl', organization: 'ICAR', content: 'Whitefly spreads the virus.' },
    { title: 'IPM Basics', organization: 'ICAR', content: 'Monitor before spraying.' },
  ]);
  assert.match(block, /\[1\] \(Tomato Leaf Curl — ICAR\)/);
  assert.match(block, /\[2\] \(IPM Basics — ICAR\)/);
});

test('buildRagPromptAddition: with chunks, instructs grounding + no-fabrication + expert-referral', () => {
  const addition = buildRagPromptAddition([{ title: 'X', organization: 'ICAR', content: 'text' }]);
  assert.match(addition, /primary factual grounding/i);
  assert.match(addition, /do not invent/i);
  assert.match(addition, /agricultural extension officer/i);
  assert.match(addition, /\[1\]/);
});

test('buildRagPromptAddition: with no chunks, tells the model no reference knowledge was found (does not imply grounding it lacks)', () => {
  const addition = buildRagPromptAddition([]);
  assert.match(addition, /no specific reference knowledge/i);
  assert.doesNotMatch(addition, /\[1\]/);
});

/* ---------------- SOURCE ATTRIBUTION ---------------- */

test('toPublicSource: strips database-internal fields (embedding, chunkId) but includes the safe content-hash documentId', () => {
  const internalChunk = {
    chunkId: 'abc123', documentId: 'doc1', embedding: [0.1, 0.2, 0.3],
    title: 'Rice Blast', organization: 'ICAR', sourceUrl: 'https://icar.org.in', relevance: 0.42,
  };
  const pub = toPublicSource(internalChunk);
  assert.deepEqual(pub, { title: 'Rice Blast', organization: 'ICAR', url: 'https://icar.org.in', relevance: 0.42, documentId: 'doc1' });
  assert.equal(pub.embedding, undefined);
  assert.equal(pub.chunkId, undefined);
});

test('toPublicSources: maps a list and handles an empty list', () => {
  assert.deepEqual(toPublicSources([]), []);
  const results = toPublicSources([{ title: 'A', organization: 'ICAR', sourceUrl: '', relevance: 0.5 }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'A');
});

test('toPublicSources: dedupes multiple chunks from the same document, keeping the highest relevance score', () => {
  const chunks = [
    { documentId: 'doc-1', title: 'Bacterial Leaf Blight', organization: 'ICAR', sourceUrl: '', relevance: 0.55 },
    { documentId: 'doc-1', title: 'Bacterial Leaf Blight', organization: 'ICAR', sourceUrl: '', relevance: 0.63 },
    { documentId: 'doc-1', title: 'Bacterial Leaf Blight', organization: 'ICAR', sourceUrl: '', relevance: 0.40 },
    { documentId: 'doc-2', title: 'Rice Blast', organization: 'ICAR', sourceUrl: '', relevance: 0.30 },
  ];
  const results = toPublicSources(chunks);
  assert.equal(results.length, 2, 'expected exactly one entry per unique document');
  const blb = results.find((r) => r.documentId === 'doc-1');
  assert.equal(blb.relevance, 0.63, 'should keep the highest relevance score among that document\'s chunks');
});

/* ---------------- RETRIEVAL SCORING (mocked KnowledgeChunk — no live MongoDB) ---------------- */

test('retrieveChunks: filters by similarity threshold, respects top-K, and removes near-duplicates', async (t) => {
  const KnowledgeChunk = require('../src/models/KnowledgeChunk');

  const relevant1 = { chunkId: 'c1', documentId: 'd1', title: 'Tomato Leaf Curl', organization: 'ICAR', category: 'disease_management', crop: 'tomato', content: 'Tomato leaf curl virus whitefly yellowing curling leaves symptoms', embedding: embedLocal('tomato leaf curl virus whitefly yellowing curling leaves symptoms') };
  const relevant1Duplicate = { chunkId: 'c1b', documentId: 'd1', title: 'Tomato Leaf Curl (dup)', organization: 'ICAR', category: 'disease_management', crop: 'tomato', content: 'Tomato leaf curl virus whitefly yellowing curling leaves symptoms', embedding: embedLocal('tomato leaf curl virus whitefly yellowing curling leaves symptoms') };
  const unrelated = { chunkId: 'c2', documentId: 'd2', title: 'PM-KISAN Scheme', organization: 'Govt of India', category: 'government_schemes', crop: '', content: 'bank account enrollment subsidy scheme installment', embedding: embedLocal('bank account enrollment subsidy scheme installment') };

  const findMock = mock.method(KnowledgeChunk, 'find', () => ({
    limit: () => ({ lean: async () => [relevant1, relevant1Duplicate, unrelated] }),
  }));

  const { retrieveChunks } = require('../src/rag/retrieval/retriever');
  const results = await retrieveChunks({ queryText: 'tomato leaves are curling and turning yellow, whitefly seen', topK: 5, threshold: 0.05 });

  findMock.mock.restore();

  assert.ok(results.length >= 1, 'expected at least one relevant result');
  assert.ok(results.every((r) => r.relevance >= 0.05), 'a result scored below the threshold');
  // Near-duplicate (same content/embedding) should have been deduplicated.
  const dupTitles = results.filter((r) => r.title.startsWith('Tomato Leaf Curl'));
  assert.equal(dupTitles.length, 1, 'near-duplicate chunk was not removed');
  // The unrelated PM-KISAN chunk should not outrank/appear above the relevant one for this query.
  assert.equal(results[0].title.startsWith('Tomato Leaf Curl'), true);
});

test('retrieveChunks: returns an empty array for empty query text without touching the database', async () => {
  const { retrieveChunks } = require('../src/rag/retrieval/retriever');
  const results = await retrieveChunks({ queryText: '' });
  assert.deepEqual(results, []);
});

/* ---------------- RAG SERVICE FALLBACK (Step 16: RAG failure must not break Farmora) ---------------- */

test('rag.service: returns empty result gracefully when MongoDB is not connected (no throw)', async () => {
  const dbConfig = require('../src/config/db');
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => false);

  const { retrieveForQuery } = require('../src/rag/services/rag.service');
  const result = await retrieveForQuery({ message: 'tomato leaves curling', mode: 'general' });

  isConnectedMock.mock.restore();

  assert.deepEqual(result, { promptAddition: '', sources: [], usedKnowledge: false });
});

test('rag.service: retrieval errors are caught and degrade gracefully instead of throwing', async () => {
  const dbConfig = require('../src/config/db');
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);
  const KnowledgeChunk = require('../src/models/KnowledgeChunk');
  const findMock = mock.method(KnowledgeChunk, 'find', () => {
    throw new Error('simulated database failure');
  });

  const { retrieveForQuery } = require('../src/rag/services/rag.service');
  const result = await retrieveForQuery({ message: 'tomato leaves curling', mode: 'general' });

  isConnectedMock.mock.restore();
  findMock.mock.restore();

  assert.equal(result.usedKnowledge, false);
  assert.deepEqual(result.sources, []);
});

test('rag.service: empty message produces no retrieval attempt (nothing to search for)', async () => {
  const dbConfig = require('../src/config/db');
  const isConnectedMock = mock.method(dbConfig, 'isConnected', () => true);

  const { retrieveForQuery } = require('../src/rag/services/rag.service');
  const result = await retrieveForQuery({ message: '', mode: 'general' });

  isConnectedMock.mock.restore();

  assert.equal(result.usedKnowledge, false);
});

/* ---------------- API INTEGRATION: /api/knowledge/search ---------------- */
/* No live MongoDB in this environment, so these exercise validation and the
   graceful "database unavailable" degradation path end-to-end through the
   real Express app, the same way tests/phase2.test.js does for Phase 2 routes. */

const request = require('supertest');
const app = require('../src/server');

test('GET /api/knowledge/search rejects a too-short query with 400', async () => {
  const res = await request(app).get('/api/knowledge/search?q=a');
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/knowledge/search rejects an out-of-range topK with 400', async () => {
  const res = await request(app).get('/api/knowledge/search?q=tomato+leaf+curl&topK=50');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/knowledge/search degrades gracefully (200, empty results) when MongoDB is unavailable, rather than crashing', async () => {
  const res = await request(app).get('/api/knowledge/search?q=tomato+leaf+curl');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.results, []);
  assert.equal(res.body.databaseAvailable, false);
});

test('GET /api/knowledge/search never allows an arbitrary raw query object (only a plain string q is accepted)', async () => {
  const res = await request(app).get('/api/knowledge/search').query({ q: { $where: 'true' } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

/* ---------------- CHAT/ANALYZE STILL WORK WITH RAG WIRED IN (no live Mongo/Groq) ---------------- */

test('POST /api/chat still validates normally with RAG wired in (message required)', async () => {
  const res = await request(app).post('/api/chat').send({ message: '', crop: 'Tomato', mode: 'general' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid request.');
});

test('POST /api/analyze still validates normally with RAG wired in (image required)', async () => {
  const res = await request(app).post('/api/analyze').field('mode', 'leaf').field('crop', 'Tomato');
  assert.equal(res.status, 400);
});
