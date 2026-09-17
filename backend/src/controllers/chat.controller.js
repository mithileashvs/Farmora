const { generateResponse } = require('../services/groq.service');
const { buildFarmerContext } = require('../services/farmContext.service');
const { retrieveForQuery } = require('../rag/services/rag.service');
const { isConnected } = require('../config/db');
const Chat = require('../models/Chat');
const { userIdSchema, objectIdSchema } = require('../utils/validate');

const MAX_MESSAGE_LENGTH = 2000;
const VALID_MODES = ['general', 'soil', 'leaf'];
const VALID_LANGUAGES = ['ta-IN', 'en-IN'];

function clampString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// userId/farmId are optional here (Phase 1 behavior — anonymous, historyless
// chat — must keep working for callers that don't send them).
function optionalId(value, schema) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const result = schema.safeParse(value.trim());
  return result.success ? result.data : null;
}

async function persistChat({ userId, farmId, message, response, language, mode, sources }) {
  if (!userId || !isConnected()) return; // best-effort only, never blocks the reply
  try {
    await Chat.create({ userId, farmId: farmId || null, message, response, language, mode, sources: sources || [] });
    // Retention: trim old messages beyond the per-user cap.
    const count = await Chat.countDocuments({ userId });
    if (count > Chat.RETENTION_LIMIT_PER_USER) {
      const excess = count - Chat.RETENTION_LIMIT_PER_USER;
      const oldest = await Chat.find({ userId }).sort({ createdAt: 1 }).limit(excess).select('_id');
      await Chat.deleteMany({ _id: { $in: oldest.map((d) => d._id) } });
    }
  } catch (err) {
    console.error(`[farmora-backend] failed to persist chat: ${err.message}`);
  }
}

async function postChat(req, res, next) {
  try {
    const body = req.body || {};

    if (body.message !== undefined && typeof body.message !== 'string') {
      const err = new Error('message must be a string');
      err.status = 400;
      throw err;
    }

    const message = (body.message || '').trim();
    if (!message) {
      const err = new Error('message is required');
      err.status = 400;
      throw err;
    }
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
    // Fix 3: pass the farmer's saved crop (from farmerContext — a single
    // reused DB lookup, not a second query) into RAG as a fallback signal,
    // completing the intended User -> Farm -> Crop -> RAG retrieval flow.
    // If the request itself named a crop, that still takes priority inside
    // understandQuery(); if there's no saved crop either, retrieval simply
    // proceeds without a crop filter — RAG works fine either way (Fix 3 #13/#14).
    const rag = await retrieveForQuery({ message, mode, crop, farmerCrop: farmerContext.crop, language });

    const result = await generateResponse({
      message,
      mode,
      crop,
      location,
      language,
      images: [],
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

    persistChat({
      userId,
      farmId,
      message,
      response: result.answer,
      language: result.language,
      mode,
      sources: rag.sources,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { postChat };
