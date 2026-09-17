/**
 * All Groq access lives here. This is the ONLY place the API key is used —
 * it never leaves this process, let alone the server.
 *
 * The system prompts, language handling, and reply post-processing below are
 * a direct port of the logic that used to run in the browser (frontend
 * index.html), moved server-side so the same behavior is preserved while the
 * key stays secret.
 */
const { GROQ_API_KEY, GROQ_MODEL } = require('../config/env');

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const FORMAT_INSTRUCTION =
  'Do not use markdown symbols like asterisks or hash headers. You may use bullet lines starting with a hyphen and space for short action steps.';

const CONFIDENCE_INSTRUCTION =
  'On the FIRST line of your reply, output only one word indicating your confidence in this diagnosis: HIGH, MEDIUM, or LOW. Then a newline, then your normal answer. Base LOW on blurry/ambiguous images or symptoms that could match multiple issues; HIGH only when symptoms are very distinctive and clear.';

const SYSTEM_PROMPTS = {
  general:
    'You are an agricultural advisor for small farmers in Tamil Nadu, India. Keep answers under 4 sentences, practical and low-cost advice only. If asked something outside farming, politely redirect to farming topics.',
  soil:
    'You are an agricultural soil advisor for Tamil Nadu, India. You will be shown a photo of soil. Based on visible color and texture ONLY, give a PRELIMINARY estimate of soil type and suggest 2-3 suited crops. State this is a rough visual estimate and ask for soil health card values (pH, N, P, K) for precise recommendations. Keep under 5 sentences.',
  soil_labresults:
    'You are an agricultural soil advisor for Tamil Nadu, India. Classify each nutrient using EXACTLY these India Soil Health Card ranges (kg/ha): Nitrogen: Low <280, Medium 280-560, High >560. Phosphorus: Low <10, Medium 10-25, High >25. Potassium: Low <110, Medium 110-280, High >280. State classification, then give SPECIFIC fertilizer dosage only for nutrients classified Low. Keep under 6 sentences.',
  leaf:
    'You are a plant health expert for Tamil Nadu farmers. You may be shown 1-3 photos of the same plant/leaf from different angles — use all provided images together for a more reliable diagnosis than a single photo would give. Give a short intro sentence naming the likely issue, then 3-4 short action steps as bullet lines starting with a hyphen. If unclear, say so honestly and suggest the nearest Krishi Vigyan Kendra.',
};

const FALLBACK_ANSWER = {
  'ta-IN': 'மன்னிக்கவும், தெளிவான பதில் கிடைக்கவில்லை.',
  'en-IN': 'Sorry, I could not generate a clear answer.',
};

function languageInstruction(lang) {
  if (lang === 'ta-IN') {
    return 'IMPORTANT: The user wrote/spoke in Tamil. Reply ONLY in simple, spoken Tamil. Do not mix in English.';
  }
  return 'IMPORTANT: The user wrote/spoke in English. Reply ONLY in simple, clear English. Do not mix in Tamil.';
}

function looksLikeLabResults(text) {
  const t = (text || '').toLowerCase();
  return /ph\s*[:=]?\s*\d/.test(t) || /\b(n|p|k|nitrogen|phosphorus|potassium)\b.*\d/.test(t);
}

// Same heuristic the frontend used: Tamil unicode block -> Tamil, else English.
// Falls back to the caller's currently-selected voice language when there's no text.
function detectLanguage(text, fallbackLang) {
  if (!text) return fallbackLang || 'ta-IN';
  return /[\u0B80-\u0BFF]/.test(text) ? 'ta-IN' : 'en-IN';
}

function farmerContextNote(crop, location) {
  if (!crop && !location) return '';
  let note = ' Additional context: ';
  if (crop) note += `growing ${crop}. `;
  if (location) note += `located in ${location}. `;
  return note + 'Tailor advice if relevant.';
}

function buildSystemPrompt({ mode, message, crop, location, replyLang, farmerContext, ragPromptAddition }) {
  let systemPrompt = SYSTEM_PROMPTS.general;
  const useConfidence = mode === 'leaf';

  if (looksLikeLabResults(message)) systemPrompt = SYSTEM_PROMPTS.soil_labresults;
  else if (mode === 'soil') systemPrompt = SYSTEM_PROMPTS.soil;
  else if (mode === 'leaf') systemPrompt = SYSTEM_PROMPTS.leaf;

  // farmerContext (from Phase 2's persisted profile/farm, when available) takes
  // priority over the plain crop/location strings; fall back to those when
  // there's no saved profile/farm context yet (e.g. anonymous first-time use).
  const contextNote = farmerContext ? ` Farmer context: ${farmerContext} Tailor advice if relevant.` : farmerContextNote(crop, location);

  systemPrompt =
    systemPrompt +
    contextNote +
    ' ' +
    languageInstruction(replyLang) +
    ' ' +
    FORMAT_INSTRUCTION +
    (useConfidence ? ' ' + CONFIDENCE_INSTRUCTION : '');

  // Phase 3: RAG grounding instructions + retrieved knowledge (if any) go
  // last, as their own clearly separated block.
  if (ragPromptAddition) {
    systemPrompt = systemPrompt + '\n\n' + ragPromptAddition;
  }

  return { systemPrompt, useConfidence };
}

function buildUserContent(message, images) {
  if (images && images.length) {
    const content = [
      { type: 'text', text: message || 'Please analyze the attached photo(s).' },
    ];
    images.forEach((img) => {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimetype};base64,${img.base64}` },
      });
    });
    return content;
  }
  return message;
}

function parseReply(rawContent, useConfidence) {
  let answer = (rawContent || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  let confidence = null;
  if (useConfidence) {
    const match = answer.match(/^(HIGH|MEDIUM|LOW)\s*\n?/i);
    if (match) {
      confidence = match[1].toLowerCase();
      answer = answer.slice(match[0].length).trim();
    }
  }

  answer = answer
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
    .trim();

  return { answer, confidence };
}

async function callGroq(systemPrompt, userContent) {
  if (!GROQ_API_KEY) {
    const err = new Error('GROQ_API_KEY is not configured on the server');
    err.status = 500;
    throw err;
  }

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        reasoning_effort: 'none',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    });
  } catch (networkErr) {
    const err = new Error('Failed to reach Groq');
    err.status = 500;
    throw err;
  }

  if (!response.ok) {
    // Diagnostic-only logging (temporary, per current investigation into the
    // "Groq request failed with status 404" report): capture enough detail
    // server-side to diagnose a bad/decommissioned model name, auth issue,
    // etc., without ever logging GROQ_API_KEY or the Authorization header.
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch (readErr) {
      bodyText = `<could not read response body: ${readErr.message}>`;
    }
    let parsedMessage = null;
    try {
      const parsed = JSON.parse(bodyText);
      parsedMessage = parsed?.error?.message || parsed?.error?.code || null;
    } catch {
      // body wasn't JSON — bodyText (already captured) is logged as-is below
    }
    console.error(
      `[farmora-backend] Groq request failed | status=${response.status} | model=${JSON.stringify(GROQ_MODEL)} | ` +
        `error="${parsedMessage || bodyText.slice(0, 500)}"`
    );

    // Upstream error text may contain request details — never forward it to the client.
    const err = new Error(`Groq request failed with status ${response.status}`);
    err.status = 500;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Full pipeline used by both the chat and analyze controllers.
 * @param {object} params
 * @param {string} params.message - user's text (may be empty when only images are sent)
 * @param {string} params.mode - 'general' | 'soil' | 'leaf'
 * @param {string} [params.crop]
 * @param {string} [params.location]
 * @param {string} params.language - fallback UI language ('ta-IN' | 'en-IN')
 * @param {Array<{base64: string, mimetype: string}>} [params.images]
 */
async function generateResponse({ message, mode, crop, location, language, images, farmerContext, ragPromptAddition }) {
  const replyLang = detectLanguage(message, language);
  const { systemPrompt, useConfidence } = buildSystemPrompt({
    mode,
    message,
    crop,
    location,
    replyLang,
    farmerContext,
    ragPromptAddition,
  });
  const userContent = buildUserContent(message, images);
  const rawContent = await callGroq(systemPrompt, userContent);
  const { answer, confidence } = parseReply(rawContent, useConfidence);

  return {
    answer: answer || FALLBACK_ANSWER[replyLang] || FALLBACK_ANSWER['ta-IN'],
    confidence,
    language: replyLang,
  };
}

module.exports = {
  generateResponse,
  // exported for unit tests
  _internal: { buildSystemPrompt, buildUserContent, parseReply, detectLanguage, looksLikeLabResults },
};
