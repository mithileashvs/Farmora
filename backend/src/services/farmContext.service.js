const User = require('../models/User');
const Farm = require('../models/Farm');
const { isConnected } = require('../config/db');

const EMPTY_CONTEXT = {
  text: '',
  crop: '',
  variety: '',
  soilType: '',
  irrigationType: '',
  location: '',
  language: '',
};

/**
 * Builds a short, relevant context object for the AI prompt AND for RAG
 * retrieval from the farmer's saved profile and (optionally) a specific
 * farm — never the whole database, and via a single DB round trip reused by
 * both callers (see `crop`/`soilType`/etc. below), rather than querying
 * MongoDB twice for the same data.
 *
 * `text` is the human-readable summary folded into the Groq system prompt
 * (Phase 2 behavior, unchanged). The structured fields (`crop`, `variety`,
 * `soilType`, `irrigationType`, `location`) are what Fix 3 adds: they let
 * the chat/analysis controllers pass the farmer's *saved* crop into RAG
 * retrieval (`rag.service.js`'s `farmerCrop` param) as a fallback signal
 * when the request itself doesn't name a crop — completing the intended
 * User → Farm → Crop → RAG retrieval flow.
 *
 * Returns the all-empty EMPTY_CONTEXT (never throws, never null) when
 * there's no userId, MongoDB is unavailable, no profile exists yet, or the
 * lookup fails for any reason — so callers can always fall back to the
 * plain crop/location fields already supported since Phase 1, and RAG can
 * always proceed without farm context (Fix 3 requirement #13/#14).
 */
async function buildFarmerContext(userId, farmId) {
  if (!userId || !isConnected()) return { ...EMPTY_CONTEXT };

  try {
    const [user, farm] = await Promise.all([
      User.findOne({ userId }),
      farmId ? Farm.findOne({ _id: farmId, userId }) : null,
    ]);

    const parts = [];
    let crop = '';
    let variety = '';
    let soilType = '';
    let irrigationType = '';
    let location = '';
    let language = '';

    if (user) {
      if (user.location && user.location.name) {
        parts.push(`Location: ${user.location.name}.`);
        location = user.location.name;
      }
      language = user.language || '';
      parts.push(`Language: ${language === 'ta-IN' ? 'Tamil' : 'English'}.`);
      if (user.primaryCrop) {
        parts.push(`Primary crop: ${user.primaryCrop}.`);
        crop = user.primaryCrop; // farm's active crop (below) takes precedence if present
      }
    }
    if (farm) {
      if (farm.areaAcres) parts.push(`Farm area: ${farm.areaAcres} acres.`);
      if (farm.soilType) {
        parts.push(`Soil: ${farm.soilType}.`);
        soilType = farm.soilType;
      }
      if (farm.irrigationType) irrigationType = farm.irrigationType;
      const activeCrop = farm.crops.find((c) => c.status === 'growing' || c.status === 'sown');
      if (activeCrop) {
        parts.push(`Current crop: ${activeCrop.name}${activeCrop.variety ? ' (' + activeCrop.variety + ')' : ''}.`);
        // A specific, currently-growing farm crop is a stronger signal than
        // the farmer's general "primary crop" — prefer it when both exist.
        crop = activeCrop.name;
        variety = activeCrop.variety || '';
      }
    }

    return { text: parts.join(' '), crop, variety, soilType, irrigationType, location, language };
  } catch (err) {
    // Context is an enhancement, never a hard dependency — if lookup fails,
    // proceed without it rather than failing the chat/analyze request.
    console.error(`[farmora-backend] farmContext lookup failed: ${err.message}`);
    return { ...EMPTY_CONTEXT };
  }
}

module.exports = { buildFarmerContext };
