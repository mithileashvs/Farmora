require('dotenv').config();

const REQUIRED_VARS = ['GROQ_API_KEY'];
const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

if (missing.length) {
  // eslint-disable-next-line no-console
  console.warn(
    `[farmora-backend] Warning: missing env var(s): ${missing.join(', ')}. ` +
      'Copy backend/.env.example to backend/.env and set them, or /api/chat ' +
      'and /api/analyze will fail with a 500 error.'
  );
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
  // Comma-separated list of allowed frontend origins, e.g.
  // "http://localhost:3000,https://myfarmora.app"
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  // MongoDB connection string for Phase 2 persistence (profiles, farms,
  // diagnosis/chat history). Optional: if unset, the server still starts and
  // chat/analyze keep working, but database-backed routes return 503.
  MONGODB_URI: process.env.MONGODB_URI || '',
  // DNS servers used to resolve the MongoDB Atlas SRV record before
  // connecting (see backend/src/config/db.js) — works around environments
  // where the default OS resolver can't resolve `_mongodb._tcp.*` SRV
  // records (observed as `querySrv ECONNREFUSED`). Comma-separated list;
  // defaults to Google's public DNS if unset.
  MONGODB_DNS_SERVERS: process.env.MONGODB_DNS_SERVERS || '8.8.8.8,8.8.4.4',

  // ---- Phase 3: RAG (retrieval-augmented generation) ----
  // Vector storage reuses MongoDB (see README "Vector database choice") —
  // no separate VECTOR_DB_URL/VECTOR_DB_KEY needed. Embeddings are stored as
  // plain number arrays on KnowledgeChunk documents.
  //
  // EMBEDDING_PROVIDER: 'local' (default, no external calls — a lightweight
  // deterministic hashing embedding, good enough for keyword-ish retrieval
  // and for running fully offline/in tests) or 'openai' (real semantic
  // embeddings via OpenAI's API — needs OPENAI_API_KEY).
  EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || 'local',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Retrieval tuning. Defaults are tuned for the 'local' embedding provider;
  // raise RAG_SIMILARITY_THRESHOLD if you switch to 'openai' (real semantic
  // embeddings produce much more meaningful cosine scores).
  RAG_TOP_K: Number(process.env.RAG_TOP_K) || 5,
  RAG_SIMILARITY_THRESHOLD:
    process.env.RAG_SIMILARITY_THRESHOLD !== undefined ? Number(process.env.RAG_SIMILARITY_THRESHOLD) : 0.12,
};
