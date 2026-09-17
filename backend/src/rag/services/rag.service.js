const { isConnected } = require('../../config/db');
const { understandQuery } = require('../retrieval/query');
const { retrieveChunks } = require('../retrieval/retriever');
const { buildRagPromptAddition } = require('../prompts/rag.prompt');
const { toPublicSources } = require('../utils/metadata');

/**
 * Single entrypoint the chat/analyze controllers call. NEVER throws —
 * retrieval is an enhancement, not a hard dependency (Phase 3 requirement:
 * "RAG failure must NOT bring down Farmora"). On any failure (no MongoDB,
 * embedding error, empty knowledge base, etc.) it returns an empty result
 * and callers proceed with the existing Phase 1/2 prompt, unchanged.
 *
 * @param {object} params
 * @param {string} [params.message]
 * @param {string} [params.mode]
 * @param {string} [params.crop] - explicit crop field from the request
 * @param {string} [params.farmerCrop] - farmer's saved primary/active crop (Phase 2)
 * @param {string} [params.language]
 * @returns {Promise<{ promptAddition: string, sources: Array, usedKnowledge: boolean }>}
 */
async function retrieveForQuery({ message, mode, crop, farmerCrop, language }) {
  const empty = { promptAddition: '', sources: [], usedKnowledge: false };

  if (!isConnected()) return empty; // no DB -> no knowledge base to search

  try {
    const { crop: detectedCrop, category, retrievalText } = understandQuery({ message, mode, crop, farmerCrop });

    if (!retrievalText.trim()) return empty;

    const chunks = await retrieveChunks({
      queryText: retrievalText,
      crop: detectedCrop,
      category,
      language,
    });

    if (!chunks.length) {
      // Knowledge base reachable but nothing relevant found — still tell the
      // model explicitly so it doesn't imply grounded evidence it doesn't have.
      return { promptAddition: buildRagPromptAddition([]), sources: [], usedKnowledge: false };
    }

    return {
      promptAddition: buildRagPromptAddition(chunks),
      sources: toPublicSources(chunks),
      usedKnowledge: true,
    };
  } catch (err) {
    // Log safely (message only, no stack/keys) and degrade gracefully.
    console.error(`[farmora-backend] RAG retrieval failed, continuing without it: ${err.message}`);
    return empty;
  }
}

module.exports = { retrieveForQuery };
