const { retrieveChunks } = require('../retrieval/retriever');
const { isConnected } = require('../../config/db');

// Public-safe shape: never the embedding vector, never internal Mongo/chunk
// ids — just enough to show a result and a short preview.
function toSearchResult(chunk) {
  return {
    title: chunk.title,
    organization: chunk.organization || '',
    url: chunk.sourceUrl || '',
    category: chunk.category,
    crop: chunk.crop || undefined,
    relevance: chunk.relevance,
    snippet: chunk.content.length > 220 ? chunk.content.slice(0, 220).trim() + '…' : chunk.content,
  };
}

async function searchKnowledge({ q, crop, language, topK }) {
  if (!isConnected()) return { results: [], databaseAvailable: false };
  const chunks = await retrieveChunks({ queryText: q, crop, language, topK });
  return { results: chunks.map(toSearchResult), databaseAvailable: true };
}

module.exports = { searchKnowledge };
