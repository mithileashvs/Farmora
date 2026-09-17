const { asyncHandler } = require('../../utils/apiError');
const { searchKnowledge } = require('../services/knowledge.service');

// GET /api/knowledge/search?q=...&crop=&language=&topK=
const search = asyncHandler(async (req, res) => {
  const { q, crop, language, topK } = req.validatedQuery;
  const { results, databaseAvailable } = await searchKnowledge({ q, crop, language, topK });
  res.json({ success: true, results, databaseAvailable });
});

module.exports = { search };
