const mongoose = require('mongoose');

const LANGUAGES = ['ta-IN', 'en-IN'];

/**
 * A "User" here is identified by an anonymous client-generated UUID
 * (see PHASE2 identity docs in README). This is NOT authentication —
 * there is no password, session, or verified identity behind it.
 */
const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    name: { type: String, trim: true, maxlength: 100, default: '' },
    language: { type: String, enum: LANGUAGES, default: 'ta-IN' },
    location: {
      name: { type: String, trim: true, maxlength: 150, default: '' },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },
    primaryCrop: { type: String, trim: true, maxlength: 100, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
module.exports.LANGUAGES = LANGUAGES;
