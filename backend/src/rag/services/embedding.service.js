const { EMBEDDING_PROVIDER, EMBEDDING_MODEL, OPENAI_API_KEY } = require('../../config/env');

const LOCAL_DIMS = 256;

/**
 * 'local' provider: a dependency-free, offline, deterministic embedding.
 *
 * This is NOT a real semantic embedding model — it's a hashed bag-of-words
 * vector (each token is hashed into one of LOCAL_DIMS buckets, weighted by
 * term frequency, then L2-normalized). Two texts that share vocabulary get
 * a meaningfully higher cosine similarity than unrelated texts, which is
 * enough for keyword-ish retrieval and lets the whole RAG pipeline run and
 * be tested with no network access and no API key.
 *
 * For production-quality semantic retrieval, set EMBEDDING_PROVIDER=openai
 * and OPENAI_API_KEY (see README "Embedding model choice").
 */
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// Simple deterministic string hash (djb2) — no crypto needed, just needs to
// be stable across runs/processes.
function hashToken(token) {
  let hash = 5381;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 33) ^ token.charCodeAt(i);
  }
  return Math.abs(hash);
}

function embedLocal(text) {
  const vec = new Array(LOCAL_DIMS).fill(0);
  const tokens = tokenize(text);
  tokens.forEach((token) => {
    const idx = hashToken(token) % LOCAL_DIMS;
    vec[idx] += 1;
  });
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

async function embedOpenAI(text) {
  if (!OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY is not configured for EMBEDDING_PROVIDER=openai');
    err.status = 500;
    throw err;
  }
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!response.ok) {
    const err = new Error(`Embedding request failed with status ${response.status}`);
    err.status = 500;
    throw err;
  }
  const data = await response.json();
  const embedding = data.data && data.data[0] && data.data[0].embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding provider returned an unexpected response shape');
  }
  return embedding;
}

// Public entrypoint: never throws for the 'local' provider (always
// available); for 'openai', throws on missing key / network failure so
// callers (rag.service.js) can decide how to fall back.
async function embedText(text) {
  if (EMBEDDING_PROVIDER === 'openai') {
    return embedOpenAI(text);
  }
  return embedLocal(text);
}

function currentProviderInfo() {
  return {
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_PROVIDER === 'openai' ? EMBEDDING_MODEL : 'local-hashed-bow-v1',
    dims: EMBEDDING_PROVIDER === 'openai' ? null : LOCAL_DIMS,
  };
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { embedText, embedLocal, cosineSimilarity, currentProviderInfo, LOCAL_DIMS };
