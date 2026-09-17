const mongoose = require('mongoose');

const MODES = ['general', 'soil', 'leaf'];
const LANGUAGES = ['ta-IN', 'en-IN'];

// SECURITY/PRIVACY: never store raw image bytes/base64 here — metadata only.
const imageMetadataSchema = new mongoose.Schema(
  {
    filename: { type: String, trim: true, maxlength: 200 },
    mimetype: { type: String, trim: true, maxlength: 100 },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const diagnosisSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true, maxlength: 100 },
    farmId: { type: String, trim: true, maxlength: 100, default: null },
    mode: { type: String, enum: MODES, required: true },
    crop: { type: String, trim: true, maxlength: 100, default: '' },
    diagnosis: { type: String, required: true, maxlength: 4000 },
    confidence: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    symptoms: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    imageMetadata: { type: [imageMetadataSchema], default: [] },
    language: { type: String, enum: LANGUAGES, default: 'ta-IN' },
    // Phase 3: public-safe RAG sources used to ground this diagnosis, if any.
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

diagnosisSchema.index({ userId: 1, createdAt: -1 });
diagnosisSchema.index({ farmId: 1, createdAt: -1 });

module.exports = mongoose.model('Diagnosis', diagnosisSchema);
module.exports.MODES = MODES;
