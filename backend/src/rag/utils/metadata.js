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
  return (chunks || []).map(toPublicSource);
}

module.exports = { toPublicSource, toPublicSources };
