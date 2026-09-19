const KnowledgeChunk = require('../../models/KnowledgeChunk');
const { embedText, cosineSimilarity } = require('../services/embedding.service');
const { RAG_TOP_K, RAG_SIMILARITY_THRESHOLD } = require('../../config/env');

// Chunks whose content overlaps this much with an already-selected, higher
// ranked chunk are treated as near-duplicates and skipped, so the prompt
// isn't padded with repetitive knowledge.
const NEAR_DUPLICATE_THRESHOLD = 0.97;

/**
 * Vector search implementation note (see README "Vector database choice"):
 * this does an in-application brute-force cosine similarity scan over
 * KnowledgeChunk documents (optionally metadata-filtered first to shrink
 * the candidate set) rather than calling a dedicated vector database. This
 * is appropriate for a knowledge base of the size Farmora currently seeds
 * (tens to low hundreds of chunks); see the README for when to graduate to
 * MongoDB Atlas Vector Search or a standalone vector database.
 */
async function retrieveChunks({ queryText, crop, category, language, topK, threshold }) {
  if (!queryText || !queryText.trim()) return [];

  // Crop is the one hard filter, and only on the first pass — it's the
  // strongest, least ambiguous signal we have (see rag/retrieval/query.js).
  // Category and language are soft preferences (small scoring boosts)
  // rather than hard filters: hard-filtering by language in particular was
  // a real bug — with an English-only seed knowledge base, a Tamil-language
  // request would hard-filter every chunk out and silently retrieve
  // nothing, even for a crop/topic the knowledge base actually covers.
  const filter = {};
  if (crop) filter.crop = crop;

  let candidates = await KnowledgeChunk.find(filter).limit(500).lean();
  // If crop filtering wiped out the candidate set (e.g. no chunks tagged
  // with that exact crop yet), fall back to the full knowledge base rather
  // than returning nothing.
  if (crop && candidates.length === 0) {
    candidates = await KnowledgeChunk.find({}).limit(500).lean();
  }
  if (candidates.length === 0) return [];

  const queryEmbedding = await embedText(queryText);

  const scored = candidates
    .map((chunk) => {
      let score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (category && chunk.category === category) score += 0.05; // small relevance boost
      if (language && chunk.language === language) score += 0.02; // small relevance boost, not a filter
      return { chunk, score };
    })
    .filter((s) => s.score >= (threshold ?? RAG_SIMILARITY_THRESHOLD))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of scored) {
    const isNearDuplicate = selected.some(
      (s) => cosineSimilarity(s.chunk.embedding, candidate.chunk.embedding) >= NEAR_DUPLICATE_THRESHOLD
    );
    if (isNearDuplicate) continue;
    selected.push(candidate);
    if (selected.length >= (topK || RAG_TOP_K)) break;
  }

  return selected.map(({ chunk, score }) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    title: chunk.title,
    source: chunk.source,
    sourceUrl: chunk.sourceUrl,
    organization: chunk.organization,
    category: chunk.category,
    crop: chunk.crop,
    topic: chunk.topic,
    language: chunk.language,
    content: chunk.content,
    relevance: Math.round(score * 1000) / 1000,
  }));
}

module.exports = { retrieveChunks };
