const crypto = require('crypto');
const KnowledgeChunk = require('../../models/KnowledgeChunk');
const { loadDocuments } = require('./loader');
const { chunkText } = require('./chunker');
const { embedChunk } = require('./embedder');

function stableId(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);
}

/**
 * Runs the full ingestion pipeline. Idempotent: re-running it upserts by a
 * deterministic chunkId (hash of documentId + chunkIndex + chunk text) —
 * it never creates duplicate knowledge records.
 *
 * @param {object} [opts]
 * @param {string} [opts.dir] - override the source directory (for tests)
 * @param {(msg: string) => void} [opts.onProgress] - progress reporter
 */
async function runIngestion(opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const documents = loadDocuments(opts.dir);

  const result = { documents: documents.length, chunksUpserted: 0, chunksSkipped: 0, failures: [] };

  for (const doc of documents) {
    const documentId = doc.id || stableId(doc.title, doc.source || '');
    let chunks;
    try {
      chunks = chunkText(doc.content);
    } catch (err) {
      result.failures.push({ document: doc.title, error: err.message });
      onProgress(`✗ ${doc.title}: chunking failed — ${err.message}`);
      continue;
    }

    for (let i = 0; i < chunks.length; i += 1) {
      const chunkContent = chunks[i];
      // The chunk's own text is part of the id so an edited source document
      // produces a new chunkId (upserted) instead of silently keeping stale
      // embeddings for changed text.
      const chunkId = stableId(documentId, String(i), chunkContent.slice(0, 80));

      try {
        const { embedding, embeddingProvider, embeddingModel, embeddingDims } = await embedChunk({
          title: doc.title,
          topic: doc.topic,
          content: chunkContent,
        });

        await KnowledgeChunk.findOneAndUpdate(
          { chunkId },
          {
            $set: {
              documentId,
              chunkIndex: i,
              title: doc.title,
              source: doc.source || '',
              sourceUrl: doc.sourceUrl || '',
              organization: doc.organization || '',
              category: doc.category || 'general_farming',
              crop: (doc.crop || '').toLowerCase(),
              cropStage: doc.cropStage || '',
              topic: doc.topic || '',
              language: doc.language || 'en-IN',
              region: doc.region || '',
              content: chunkContent,
              version: doc.version || 1,
              publishedDate: doc.publishedDate ? new Date(doc.publishedDate) : undefined,
              lastVerifiedAt: doc.lastVerifiedAt ? new Date(doc.lastVerifiedAt) : new Date(),
              embedding,
              embeddingProvider,
              embeddingModel,
              embeddingDims,
            },
          },
          { upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );
        result.chunksUpserted += 1;
      } catch (err) {
        result.failures.push({ document: doc.title, chunkIndex: i, error: err.message });
        onProgress(`✗ ${doc.title} [chunk ${i}]: ${err.message}`);
        result.chunksSkipped += 1;
      }
    }
    onProgress(`✓ ${doc.title} — ${chunks.length} chunk(s)`);
  }

  return result;
}

module.exports = { runIngestion, stableId };
