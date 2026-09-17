const express = require('express');
const { validateQuery } = require('../../utils/validate');
const { knowledgeLimiter } = require('../../middleware/rateLimit.middleware');
const { searchQuerySchema } = require('../utils/knowledge.validators');
const { search } = require('../controllers/knowledge.controller');

const router = express.Router();

// Never allows raw/unrestricted vector queries — q is a plain validated
// string turned into an embedding server-side, never a client-supplied
// vector or database query.
router.get('/search', knowledgeLimiter, validateQuery(searchQuerySchema), search);

module.exports = router;
