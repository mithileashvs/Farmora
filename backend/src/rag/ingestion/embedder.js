const { embedText, currentProviderInfo } = require('../services/embedding.service');

// Embeds a chunk's text combined with a little title/topic context, since
// that improves retrieval relevance even for the lightweight 'local'
// provider (shared vocabulary between query and title/topic helps).
async function embedChunk({ title, topic, content }) {
  const info = currentProviderInfo();
  const textForEmbedding = [title, topic, content].filter(Boolean).join('\n');
  const embedding = await embedText(textForEmbedding);
  return {
    embedding,
    embeddingProvider: info.provider,
    embeddingModel: info.model,
    embeddingDims: embedding.length,
  };
}

module.exports = { embedChunk };
