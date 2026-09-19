const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');

const { retrieveChunks } = require('../src/rag/retrieval/retriever');
const { embedLocal } = require('../src/rag/services/embedding.service');
const { _internal } = require('../src/services/groq.service');
const { buildSystemPrompt } = _internal;

/* ---------------- Bug fix: language must be a soft boost, not a hard filter ---------------- */

test('retrieveChunks: a language filter no longer hard-excludes relevant chunks in a different language (regression test)', async () => {
  const KnowledgeChunk = require('../src/models/KnowledgeChunk');

  // Every stored chunk is English-only, as Farmora's actual seed knowledge
  // base currently is — this is the exact real-world scenario that
  // previously caused a Tamil-language request to retrieve zero chunks
  // even when a clearly relevant English chunk existed.
  const chunk = {
    chunkId: 'c1', documentId: 'd1', title: 'Bacterial Leaf Blight of Rice',
    organization: 'ICAR', category: 'disease_management', crop: 'paddy', language: 'en-IN',
    content: 'bacterial leaf blight rice symptoms management xanthomonas',
    embedding: embedLocal('bacterial leaf blight rice symptoms management xanthomonas'),
  };

  const findMock = mock.method(KnowledgeChunk, 'find', () => ({
    limit: () => ({ lean: async () => [chunk] }),
  }));

  const results = await retrieveChunks({
    queryText: 'bacterial leaf blight rice symptoms',
    crop: 'paddy',
    language: 'ta-IN', // request language does NOT match the chunk's language
    threshold: 0.05,
  });

  findMock.mock.restore();

  assert.equal(results.length, 1, 'a relevant chunk in a different language should still be retrieved, not hard-filtered out');
  assert.equal(results[0].title, 'Bacterial Leaf Blight of Rice');
});

test('retrieveChunks: a matching language still gets a small relevance boost over a non-matching one', async () => {
  const KnowledgeChunk = require('../src/models/KnowledgeChunk');
  const sharedContent = 'tomato leaf curl virus whitefly yellowing symptoms';
  const embedding = embedLocal(sharedContent);

  const enChunk = { chunkId: 'en1', documentId: 'd-en', title: 'EN doc', organization: 'ICAR', category: 'disease_management', crop: 'tomato', language: 'en-IN', content: sharedContent, embedding };
  const taChunk = { chunkId: 'ta1', documentId: 'd-ta', title: 'TA doc', organization: 'ICAR', category: 'disease_management', crop: 'tomato', language: 'ta-IN', content: sharedContent, embedding };

  const findMock = mock.method(KnowledgeChunk, 'find', () => ({
    limit: () => ({ lean: async () => [enChunk, taChunk] }),
  }));

  const results = await retrieveChunks({ queryText: sharedContent, crop: 'tomato', language: 'ta-IN', threshold: 0.05 });

  findMock.mock.restore();

  assert.equal(results[0].title, 'TA doc', 'the language-matching chunk should rank first thanks to the soft boost');
});

/* ---------------- Retrieved chunks actually reach the Groq system prompt ---------------- */

test('buildSystemPrompt: retrieved knowledge chunks reach the actual prompt text sent to Groq', () => {
  const { buildRagPromptAddition } = require('../src/rag/prompts/rag.prompt');
  const ragPromptAddition = buildRagPromptAddition([
    { title: 'Bacterial Leaf Blight of Rice', organization: 'ICAR', content: 'Symptoms include water-soaked yellow streaks on leaf margins.' },
  ]);

  const { systemPrompt } = buildSystemPrompt({
    mode: 'general',
    message: 'bacterial leaf blight symptoms',
    replyLang: 'en-IN',
    ragPromptAddition,
  });

  assert.match(systemPrompt, /Bacterial Leaf Blight of Rice/, 'retrieved chunk title should appear in the system prompt');
  assert.match(systemPrompt, /water-soaked yellow streaks/, 'retrieved chunk content should appear in the system prompt');
  assert.match(systemPrompt, /primary factual grounding/i, 'grounding instructions should be present alongside the knowledge');
});

test('buildSystemPrompt: with zero retrieved chunks, the prompt explicitly says so rather than silently omitting grounding', () => {
  const { buildRagPromptAddition } = require('../src/rag/prompts/rag.prompt');
  const ragPromptAddition = buildRagPromptAddition([]);

  const { systemPrompt } = buildSystemPrompt({
    mode: 'general',
    message: 'some obscure question',
    replyLang: 'en-IN',
    ragPromptAddition,
  });

  assert.match(systemPrompt, /no specific reference knowledge/i);
});

/* ---------------- Full pipeline: understandQuery -> retrieveChunks for the 4 required test queries ---------------- */

test('End-to-end retrieval (mocked KnowledgeChunk): all 4 required test queries retrieve at least one relevant, correctly-attributed source', async () => {
  const KnowledgeChunk = require('../src/models/KnowledgeChunk');
  const { understandQuery } = require('../src/rag/retrieval/query');

  function makeChunk(id, title, crop, category, content) {
    return { chunkId: id, documentId: id, title, organization: 'ICAR', category, crop, language: 'en-IN', content, embedding: embedLocal(`${title} ${content}`) };
  }

  const knowledgeBase = [
    makeChunk('blb', 'Bacterial Leaf Blight of Rice', 'paddy', 'disease_management', 'bacterial leaf blight xanthomonas rice symptoms wilting yellowing management'),
    makeChunk('blast', 'Rice Blast Disease', 'paddy', 'disease_management', 'rice blast fungus leaf spots panicle'),
    makeChunk('cultivation', 'Paddy Cultivation Basics', 'paddy', 'crop_cultivation', 'paddy rice cultivation sowing season water irrigation management'),
    makeChunk('tomato-curl', 'Tomato Leaf Curl', 'tomato', 'disease_management', 'tomato leaf curl virus whitefly yellowing curling'),
  ];

  const findMock = mock.method(KnowledgeChunk, 'find', () => ({
    limit: () => ({ lean: async () => knowledgeBase }),
  }));

  const queries = [
    { message: 'What are the symptoms and management methods for bacterial leaf blight in rice?', expectTitle: 'Bacterial Leaf Blight of Rice' },
    { message: 'Tell me about rice cultivation', expectTitle: 'Paddy Cultivation Basics' },
    { message: 'How should I manage rice irrigation?', expectTitle: null }, // just needs SOME relevant paddy result
    { message: 'My tomato leaves are curling, what should I do?', expectTitle: 'Tomato Leaf Curl' },
  ];

  for (const q of queries) {
    const { crop, category, retrievalText } = understandQuery({ message: q.message, mode: 'general' });
    const results = await retrieveChunks({ queryText: retrievalText, crop, category, threshold: 0.05 });
    assert.ok(results.length > 0, `expected at least one retrieved source for: "${q.message}"`);
    // Source attribution fields must be present and non-fabricated (drawn from the mocked KB itself).
    results.forEach((r) => {
      assert.ok(r.title, 'source missing title');
      assert.ok(r.organization, 'source missing organization');
      assert.ok(typeof r.relevance === 'number', 'source missing a numeric relevance score');
    });
    if (q.expectTitle) {
      assert.equal(results[0].title, q.expectTitle, `top result for "${q.message}" should be the most relevant document`);
    }
  }

  findMock.mock.restore();
});

test('End-to-end retrieval: a query with no matching knowledge at all returns zero chunks (no fabrication)', async () => {
  const KnowledgeChunk = require('../src/models/KnowledgeChunk');
  const findMock = mock.method(KnowledgeChunk, 'find', () => ({
    limit: () => ({ lean: async () => [
      { chunkId: 'x', documentId: 'x', title: 'PM-KISAN Scheme', organization: 'Govt of India', category: 'government_schemes', crop: '', language: 'en-IN', content: 'bank account enrollment subsidy installment scheme', embedding: embedLocal('bank account enrollment subsidy installment scheme') },
    ] }),
  }));

  const results = await retrieveChunks({ queryText: 'asdkjh unrelated gibberish query xyz123', threshold: 0.12 });

  findMock.mock.restore();

  assert.deepEqual(results, []);
});
