const test = require('node:test');
const assert = require('node:assert/strict');

const { _internal } = require('../src/services/groq.service');
const { buildSystemPrompt, buildUserContent, parseReply, detectLanguage, looksLikeLabResults } = _internal;

test('detectLanguage: falls back to caller language when no text', () => {
  assert.equal(detectLanguage('', 'ta-IN'), 'ta-IN');
  assert.equal(detectLanguage(undefined, 'en-IN'), 'en-IN');
  assert.equal(detectLanguage('', undefined), 'ta-IN'); // default fallback
});

test('detectLanguage: detects Tamil unicode block', () => {
  assert.equal(detectLanguage('வணக்கம்', 'en-IN'), 'ta-IN');
  assert.equal(detectLanguage('hello', 'ta-IN'), 'en-IN');
});

test('looksLikeLabResults: matches pH and NPK-style text', () => {
  assert.equal(looksLikeLabResults('pH: 6.5, N 240'), true);
  assert.equal(looksLikeLabResults('nitrogen 300 phosphorus 12'), true);
  assert.equal(looksLikeLabResults('what crop should I grow'), false);
});

test('buildSystemPrompt: picks leaf prompt and enables confidence for leaf mode', () => {
  const { systemPrompt, useConfidence } = buildSystemPrompt({
    mode: 'leaf',
    message: 'my plant has spots',
    crop: '',
    location: '',
    replyLang: 'en-IN',
  });
  assert.equal(useConfidence, true);
  assert.match(systemPrompt, /plant health expert/);
  assert.match(systemPrompt, /HIGH, MEDIUM, or LOW/);
  assert.match(systemPrompt, /simple, clear English/);
});

test('buildSystemPrompt: lab-results detection overrides soil mode', () => {
  const { systemPrompt, useConfidence } = buildSystemPrompt({
    mode: 'soil',
    message: 'pH: 6.2, N: 250, P: 8, K: 90',
    crop: 'paddy',
    location: 'Trichy',
    replyLang: 'en-IN',
  });
  assert.equal(useConfidence, false);
  assert.match(systemPrompt, /Soil Health Card ranges/);
  assert.match(systemPrompt, /growing paddy/);
  assert.match(systemPrompt, /located in Trichy/);
});

test('buildUserContent: plain text when no images', () => {
  const content = buildUserContent('hello', []);
  assert.equal(content, 'hello');
});

test('buildUserContent: text + image_url blocks when images present', () => {
  const content = buildUserContent('check this leaf', [{ base64: 'abc', mimetype: 'image/jpeg' }]);
  assert.equal(Array.isArray(content), true);
  assert.equal(content[0].type, 'text');
  assert.equal(content[1].type, 'image_url');
  assert.match(content[1].image_url.url, /^data:image\/jpeg;base64,abc$/);
});

test('parseReply: extracts confidence and strips markdown/think tags', () => {
  const raw = '<think>internal reasoning</think>HIGH\nThis looks like **leaf blight**. - Remove affected leaves';
  const { answer, confidence } = parseReply(raw, true);
  assert.equal(confidence, 'high');
  assert.doesNotMatch(answer, /<think>/);
  assert.doesNotMatch(answer, /\*\*/);
  assert.match(answer, /leaf blight/);
});

test('parseReply: no confidence parsing when useConfidence is false', () => {
  const { answer, confidence } = parseReply('HIGH\nSome answer', false);
  assert.equal(confidence, null);
  assert.match(answer, /^HIGH/);
});
