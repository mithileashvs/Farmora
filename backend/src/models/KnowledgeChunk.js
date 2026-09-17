const mongoose = require('mongoose');

const CATEGORIES = [
  'crop_cultivation',
  'soil_management',
  'fertilizer',
  'irrigation',
  'pest_management',
  'disease_management',
  'weather',
  'harvesting',
  'post_harvest',
  'government_schemes',
  'best_practices',
  'general_farming',
];

const LANGUAGES = ['ta-IN', 'en-IN'];

/**
 * A single retrievable chunk of an agricultural knowledge document.
 *
 * Vector storage choice (see README "Vector database choice"): rather than
 * standing up a separate vector database, embeddings are stored as plain
 * number arrays on these documents in the same MongoDB the rest of Phase 2
 * already uses, and similarity search is done in the application layer
 * (backend/src/rag/retrieval/retriever.js). This is a deliberate,
 * infra-minimal choice appropriate for a knowledge base of this size — see
 * the README for when to graduate to a dedicated vector database.
 */
const knowledgeChunkSchema = new mongoose.Schema(
  {
    // Stable id for the *source document* this chunk came from (not this
    // chunk) — lets ingestion be idempotent and lets multiple chunks share
    // document-level metadata/attribution.
    documentId: { type: String, required: true, trim: true, maxlength: 200 },
    // Stable, deterministic id for THIS chunk (documentId + chunkIndex,
    // hashed) — re-running ingestion upserts by this id instead of
    // duplicating records.
    chunkId: { type: String, required: true, unique: true, trim: true, maxlength: 220 },
    chunkIndex: { type: Number, required: true, min: 0 },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    source: { type: String, trim: true, maxlength: 200, default: '' },
    sourceUrl: { type: String, trim: true, maxlength: 500, default: '' },
    organization: { type: String, trim: true, maxlength: 200, default: '' },

    category: { type: String, enum: CATEGORIES, default: 'general_farming' },
    crop: { type: String, trim: true, maxlength: 100, default: '' },
    cropStage: { type: String, trim: true, maxlength: 100, default: '' },
    topic: { type: String, trim: true, maxlength: 150, default: '' },
    language: { type: String, enum: LANGUAGES, default: 'en-IN' },
    region: { type: String, trim: true, maxlength: 150, default: '' },

    content: { type: String, required: true, maxlength: 3000 },

    version: { type: Number, default: 1 },
    publishedDate: { type: Date },
    lastVerifiedAt: { type: Date },

    // Embedding + provider metadata. Kept internal — never sent to the
    // frontend (see rag.service.js's toPublicSource()).
    embedding: { type: [Number], required: true },
    embeddingProvider: { type: String, trim: true, maxlength: 50 },
    embeddingModel: { type: String, trim: true, maxlength: 100 },
    embeddingDims: { type: Number },
  },
  { timestamps: true }
);

knowledgeChunkSchema.index({ documentId: 1 });
knowledgeChunkSchema.index({ crop: 1 });
knowledgeChunkSchema.index({ category: 1 });
knowledgeChunkSchema.index({ language: 1 });

module.exports = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.LANGUAGES = LANGUAGES;
