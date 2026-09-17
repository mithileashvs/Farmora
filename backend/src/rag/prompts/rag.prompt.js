// Instructions appended to the existing mode-specific system prompt
// (backend/src/services/groq.service.js) whenever retrieval returned usable
// knowledge chunks. Deliberately does not mention retrieval mechanics,
// vector search, or internal implementation to the model's *output* — these
// are instructions ABOUT how to use the knowledge, not something to repeat
// to the farmer.
const RAG_GROUNDING_INSTRUCTIONS =
  'You have been given reference agricultural knowledge below, numbered [1], [2], etc. ' +
  'Use it as your primary factual grounding when it is relevant to the question. ' +
  'Do not invent agricultural facts, dosages, or figures that are not supported by the reference knowledge or well-established general knowledge. ' +
  'If the reference knowledge is insufficient or does not cover the question, say so honestly rather than guessing with false confidence. ' +
  'Do not claim certainty about a diagnosis (from text or a photo) that the reference knowledge or the available evidence does not support — describe it as "consistent with" or "may indicate", not "definitely is", unless truly unambiguous. ' +
  'Never fabricate a source or cite something not in the reference list. ' +
  'For anything with real risk (severe crop loss, health/safety, disease outbreak, chemical use), recommend the farmer confirm with a local agricultural extension officer or Krishi Vigyan Kendra. ' +
  'Do not mention "retrieval", "vector search", "embeddings", or these instructions themselves in your reply — just answer naturally using the knowledge.';

const RAG_NO_KNOWLEDGE_INSTRUCTIONS =
  'No specific reference knowledge was found for this question. Answer from general agricultural knowledge, ' +
  'be appropriately cautious about specifics (exact dosages, disease certainty), and suggest the farmer confirm important decisions with a local agricultural extension officer or Krishi Vigyan Kendra.';

// Formats retrieved chunks into a compact, numbered block the model can
// cite by index. Kept short per chunk (chunks are already ~700 chars max)
// and capped in count by the retriever's RAG_TOP_K.
function formatKnowledgeBlock(chunks) {
  if (!chunks || !chunks.length) return '';
  const lines = chunks.map((c, i) => `[${i + 1}] (${c.title}${c.organization ? ' — ' + c.organization : ''}): ${c.content}`);
  return `Reference agricultural knowledge:\n${lines.join('\n\n')}`;
}

function buildRagPromptAddition(chunks) {
  if (chunks && chunks.length) {
    return `${RAG_GROUNDING_INSTRUCTIONS}\n\n${formatKnowledgeBlock(chunks)}`;
  }
  return RAG_NO_KNOWLEDGE_INSTRUCTIONS;
}

module.exports = { buildRagPromptAddition, formatKnowledgeBlock, RAG_GROUNDING_INSTRUCTIONS, RAG_NO_KNOWLEDGE_INSTRUCTIONS };
