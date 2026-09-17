// Known crop keywords the knowledge base currently covers (kept in sync
// loosely with backend/data/knowledge/*.json "crop" fields). Extend this
// list as more knowledge documents are ingested.
const KNOWN_CROPS = [
  'paddy', 'rice', 'nel', 'groundnut', 'peanut', 'sugarcane', 'cotton',
  'tomato', 'vegetable', 'vegetables', 'brinjal', 'chilli', 'chili',
];

const TOPIC_KEYWORDS = {
  disease_management: ['disease', 'blast', 'blight', 'rot', 'fungus', 'fungal', 'spot', 'infection', 'virus', 'curl'],
  pest_management: ['pest', 'insect', 'worm', 'bollworm', 'whitefly', 'aphid', 'infestation'],
  soil_management: ['soil', 'nutrient', 'nitrogen', 'phosphorus', 'potassium', 'npk', 'ph'],
  fertilizer: ['fertilizer', 'fertiliser', 'dose', 'urea', 'compost', 'manure'],
  irrigation: ['irrigation', 'water', 'drip', 'watering', 'drought'],
  government_schemes: ['scheme', 'subsidy', 'pm-kisan', 'pmkisan', 'loan', 'insurance'],
  post_harvest: ['storage', 'harvest', 'drying', 'store', 'post-harvest'],
  weather: ['monsoon', 'rain', 'weather', 'season', 'sowing calendar'],
};

// Maps a normalized crop keyword to the canonical value used in
// KnowledgeChunk.crop (see backend/data/knowledge/*.json).
const CROP_ALIASES = {
  rice: 'paddy',
  nel: 'paddy',
  peanut: 'groundnut',
  vegetable: 'vegetables',
  chili: 'chilli',
};

function normalizeCrop(word) {
  const w = word.toLowerCase();
  return CROP_ALIASES[w] || w;
}

/**
 * Extracts lightweight retrieval signals from the farmer's message and the
 * already-available Phase 2 farmer/farm context — deliberately NOT another
 * LLM call, just keyword matching, per the Phase 3 requirement to avoid
 * over-engineering this step.
 *
 * @param {object} params
 * @param {string} [params.message]
 * @param {string} [params.mode] - 'general' | 'soil' | 'leaf'
 * @param {string} [params.crop] - explicit crop field from the request, if any
 * @param {string} [params.farmerCrop] - the farmer's saved primary/active crop, if any
 */
function understandQuery({ message, mode, crop, farmerCrop }) {
  const text = (message || '').toLowerCase();

  let detectedCrop = '';
  if (crop) detectedCrop = normalizeCrop(crop);
  else {
    const found = KNOWN_CROPS.find((c) => text.includes(c));
    if (found) detectedCrop = normalizeCrop(found);
    else if (farmerCrop) detectedCrop = normalizeCrop(farmerCrop);
  }

  let category = '';
  for (const [cat, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) {
      category = cat;
      break;
    }
  }
  // Image modes without explicit category keywords are usually diagnosis-oriented.
  if (!category) {
    if (mode === 'leaf') category = 'disease_management';
    else if (mode === 'soil') category = 'soil_management';
  }

  return {
    crop: detectedCrop,
    category,
    // The text actually used for embedding/similarity search — richer than
    // the raw message alone helps the lightweight local embedding provider.
    retrievalText: [message, detectedCrop, category ? category.replace(/_/g, ' ') : ''].filter(Boolean).join(' '),
  };
}

module.exports = { understandQuery, KNOWN_CROPS, TOPIC_KEYWORDS };
