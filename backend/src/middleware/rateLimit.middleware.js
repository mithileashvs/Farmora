const rateLimit = require('express-rate-limit');

function tooManyRequests(req, res) {
  res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
}

// Generous enough for normal chatting/testing, but stops abuse.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});

// Image analysis is more expensive (vision model), so it gets a stricter cap.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});

// Knowledge search is a cheap DB read, but still capped against abuse/scraping.
const knowledgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});

module.exports = { chatLimiter, analyzeLimiter, knowledgeLimiter };
