/**
 * TEMPORARY DIAGNOSTIC — NOT part of the application runtime.
 *
 * Calls GET https://api.groq.com/openai/v1/models using the existing
 * GROQ_API_KEY (from backend/.env, via the same config/env.js the rest of
 * the app uses — no new config added) and prints:
 *   - each accessible model's id
 *   - whether that model appears to support image/vision input, based only
 *     on fields the API itself returns (nothing guessed/hardcoded beyond a
 *     small heuristic fallback noted below)
 *
 * The API key is NEVER printed or logged, in any form.
 *
 * Usage:
 *   node backend/scripts/list-groq-models.js
 *
 * This file is not referenced by package.json or the server — it exists
 * only to answer "which vision-capable model(s) is this key actually
 * allowed to use", per the current Groq 404 investigation. Delete it once
 * that's resolved.
 */
require('dotenv').config();
const { GROQ_API_KEY } = require('../src/config/env');

const MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

// Groq's /models response doesn't always include an explicit boolean vision
// flag on every account/tier — where the API itself tells us (e.g. a
// `capabilities`/`modalities` type field), we use that. As a fallback ONLY,
// we flag ids that are well-known-by-name to be Groq's current vision
// models, so the report is still useful even if the API response shape
// doesn't expose capabilities directly. This fallback list reflects only
// what Groq's own public model docs list as vision-capable at the time
// this script was written — it is not a guarantee for your account.
const KNOWN_VISION_MODEL_ID_PATTERNS = [
  /^qwen\/qwen3\.\d+-27b$/i, // e.g. qwen/qwen3.6-27b, qwen/qwen3.8-27b
  /llama-4-(scout|maverick)/i,
  /llama-3\.2-.*-vision/i,
];

function looksVisionCapableByName(id) {
  return KNOWN_VISION_MODEL_ID_PATTERNS.some((pattern) => pattern.test(id));
}

// Inspects whatever fields Groq's API actually returned for explicit
// capability info, without assuming a specific schema (Groq's /models
// response shape isn't guaranteed identical across accounts/versions).
function detectVisionFromApiFields(model) {
  const haystack = JSON.stringify(model).toLowerCase();
  if (haystack.includes('"vision"') || haystack.includes('image_url') || haystack.includes('multimodal')) {
    return true;
  }
  return null; // API didn't tell us either way
}

async function main() {
  if (!GROQ_API_KEY) {
    console.error('✗ GROQ_API_KEY is not set in backend/.env — nothing to check.');
    process.exitCode = 1;
    return;
  }

  let response;
  try {
    response = await fetch(MODELS_ENDPOINT, {
      method: 'GET',
      headers: {
        // Never logged — only sent on the request itself.
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
    });
  } catch (networkErr) {
    console.error(`✗ Failed to reach Groq: ${networkErr.message}`);
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      bodyText = '<could not read response body>';
    }
    console.error(`✗ GET /models failed with status ${response.status}`);
    console.error(`  Response: ${bodyText.slice(0, 1000)}`);
    process.exitCode = 1;
    return;
  }

  const data = await response.json();
  const models = Array.isArray(data.data) ? data.data : [];

  if (!models.length) {
    console.log('No models returned for this API key.');
    return;
  }

  console.log(`Accessible Groq models for this API key: ${models.length}\n`);
  console.log('MODEL ID'.padEnd(45) + 'VISION?');
  console.log('-'.repeat(60));

  const visionModels = [];
  models
    .map((m) => m.id)
    .sort()
    .forEach((id) => {
      const model = models.find((m) => m.id === id);
      const apiSaysVision = detectVisionFromApiFields(model);
      const nameSaysVision = looksVisionCapableByName(id);
      const vision = apiSaysVision === true || (apiSaysVision === null && nameSaysVision);
      const label = apiSaysVision !== null ? (apiSaysVision ? 'yes (API field)' : 'no (API field)') : nameSaysVision ? 'likely (by name — see note below)' : 'no';
      console.log(id.padEnd(45) + label);
      if (vision) visionModels.push(id);
    });

  console.log('\nNote: "likely (by name)" entries are inferred from Groq\'s public');
  console.log('model-naming conventions, not an explicit field in this response —');
  console.log('verify against https://console.groq.com/docs/vision before relying on it.\n');

  if (visionModels.length) {
    console.log(`Vision-capable candidate(s) accessible to this key: ${visionModels.join(', ')}`);
  } else {
    console.log('No model in this list appears vision-capable — text-only chat would still work,');
    console.log('but soil/leaf/general image analysis would need a different accessible model');
    console.log('or additional Groq account access.');
  }
}

main();
