// Never send embeddings, internal chunk ids, or raw Mongo _ids to the
// frontend — only what's needed to display and trust a source. `documentId`
// is the one internal-ish field we DO expose, deliberately: it's a stable
// content hash (see rag/ingestion/ingest.js's stableId()), not a database
// primary key or an ObjectId, so it doesn't reveal MongoDB implementation
// details — it just lets a client (or a future "view full source" feature)
// identify which underlying knowledge document an answer drew from.
function toPublicSource(chunk) {
  return {
    title: chunk.title,
    organization: chunk.organization || '',
    url: chunk.sourceUrl || '',
    relevance: chunk.relevance,
    documentId: chunk.documentId || undefined,
  };
}

function toPublicSources(chunks) {
  // Multiple retrieved chunks often come from the same source document
  // (chunked into pieces) — dedupe by documentId so the frontend shows
  // "this document" once, not the same title repeated several times, while
  // keeping the highest-relevance chunk's score for that document.
  const seen = new Map();
  for (const chunk of chunks || []) {
    const key = chunk.documentId || chunk.title;
    const existing = seen.get(key);
    if (!existing || (chunk.relevance || 0) > (existing.relevance || 0)) {
      seen.set(key, chunk);
    }
  }
  return Array.from(seen.values()).map(toPublicSource);
}

module.exports = { toPublicSource, toPublicSources };
