const { generateResponse } = require('../services/groq.service');
const { buildFarmerContext } = require('../services/farmContext.service');
const { retrieveForQuery } = require('../rag/services/rag.service');
const { isConnected } = require('../config/db');
const Diagnosis = require('../models/Diagnosis');
const { userIdSchema, objectIdSchema } = require('../utils/validate');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_FILES = 3;
const VALID_MODES = ['general', 'soil', 'leaf'];
const VALID_LANGUAGES = ['ta-IN', 'en-IN'];

function clampString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalId(value, schema) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const result = schema.safeParse(value.trim());
  return result.success ? result.data : null;
}

// Bullet lines (the AI's "- action step" format) double as a lightweight
// recommendations list for the saved diagnosis record.
function extractBullets(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .slice(0, 10);
}

// SECURITY/PRIVACY: only safe metadata is derived here — filename, MIME
// type, byte size. Raw image bytes/base64 are never persisted.
function imageMetadataFrom(files) {
  return files.map((file) => ({
    filename: file.originalname ? file.originalname.slice(0, 200) : undefined,
    mimetype: file.mimetype,
  }));
}

async function persistDiagnosis({ userId, farmId, mode, crop, diagnosis, confidence, recommendations, images, language, sources }) {
  if (!userId || !isConnected()) return; // best-effort, never blocks the reply
  try {
    await Diagnosis.create({
      userId,
      farmId: farmId || null,
      mode,
      crop,
      diagnosis,
      confidence: confidence || null,
      symptoms: [],
      recommendations,
      imageMetadata: images,
      language,
      sources: sources || [],
    });
  } catch (err) {
    console.error(`[farmora-backend] failed to persist diagnosis: ${err.message}`);
  }
}

async function postAnalyze(req, res, next) {
  try {
    const body = req.body || {};
    const files = req.files || [];

    if (!files.length) {
      const err = new Error('at least one image is required');
      err.status = 400;
      throw err;
    }
    if (files.length > MAX_FILES) {
      const err = new Error('too many images');
      err.status = 400;
      throw err;
    }
    if (body.message !== undefined && typeof body.message !== 'string') {
      const err = new Error('message must be a string');
      err.status = 400;
      throw err;
    }

    const message = (body.message || '').trim();
    if (message.length > MAX_MESSAGE_LENGTH) {
      const err = new Error('message too long');
      err.status = 400;
      throw err;
    }

    const mode = VALID_MODES.includes(body.mode) ? body.mode : 'general';
    const language = VALID_LANGUAGES.includes(body.language) ? body.language : 'ta-IN';
    const crop = clampString(body.crop, 100);
    const location = clampString(body.location, 100);
    const userId = optionalId(body.userId, userIdSchema);
    const farmId = optionalId(body.farmId, objectIdSchema);

    const farmerContext = await buildFarmerContext(userId, farmId);
    // Fix 3: same reused-context wiring as chat.controller.js — see the
    // comment there for why this uses farmerContext.crop as a RAG fallback
    // signal instead of a second database query.
    const rag = await retrieveForQuery({ message, mode, crop, farmerCrop: farmerContext.crop, language });

    const images = files.map((file) => ({
      base64: file.buffer.toString('base64'),
      mimetype: file.mimetype,
    }));

    const result = await generateResponse({
      message,
      mode,
      crop,
      location,
      language,
      images,
      farmerContext: farmerContext.text,
      ragPromptAddition: rag.promptAddition,
    });

    res.json({
      success: true,
      response: result.answer,
      language: result.language,
      confidence: result.confidence,
      sources: rag.sources,
    });

    // Only persisted after a successful analysis (per Phase 2 spec) — a
    // thrown error above already skipped this via `throw`/`next`.
    persistDiagnosis({
      userId,
      farmId,
      mode,
      crop,
      diagnosis: result.answer,
      confidence: result.confidence,
      recommendations: extractBullets(result.answer),
      images: imageMetadataFrom(files),
      language: result.language,
      sources: rag.sources,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { postAnalyze };
