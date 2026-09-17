const mongoose = require('mongoose');

const MODES = ['general', 'soil', 'leaf'];
const LANGUAGES = ['ta-IN', 'en-IN'];

const chatSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true, maxlength: 100 },
    farmId: { type: String, trim: true, maxlength: 100, default: null },
    message: { type: String, required: true, maxlength: 2000 },
    response: { type: String, required: true, maxlength: 4000 },
    language: { type: String, enum: LANGUAGES, default: 'ta-IN' },
    mode: { type: String, enum: MODES, default: 'general' },
    // Phase 3: public-safe RAG sources used to ground this answer, if any
    // (title/organization/url/relevance only — never embeddings or ids).
    sources: {
      type: [
        {
          title: String,
          organization: String,
          url: String,
          relevance: Number,
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatSchema.index({ userId: 1, createdAt: -1 });
chatSchema.index({ farmId: 1, createdAt: -1 });

// Retention: keep only the most recent N messages per user so history can't
// grow unbounded. Called (fire-and-forget, best-effort) after saving a chat.
const RETENTION_LIMIT_PER_USER = 200;
chatSchema.statics.RETENTION_LIMIT_PER_USER = RETENTION_LIMIT_PER_USER;

module.exports = mongoose.model('Chat', chatSchema);
module.exports.MODES = MODES;
