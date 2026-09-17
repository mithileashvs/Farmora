const express = require('express');
const { chatLimiter } = require('../middleware/rateLimit.middleware');
const { postChat } = require('../controllers/chat.controller');

const router = express.Router();

// POST /api/chat — text-only chat, no images.
router.post('/', chatLimiter, postChat);

module.exports = router;
