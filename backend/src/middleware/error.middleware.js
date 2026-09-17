const multer = require('multer');

/**
 * Centralized error handler. Never forwards stack traces, API keys, internal
 * file paths, or raw upstream (Groq) error bodies to the client — only the
 * safe, generic messages below. Full details are logged server-side only,
 * and the log line itself never includes image bytes or the API key.
 */
// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl} -> ${err.message}`);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'Image too large.' });
    }
    return res.status(400).json({ success: false, error: 'Invalid request.' });
  }

  if (err.message === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ success: false, error: 'Invalid request.' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Image too large.' });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(400).json({ success: false, error: 'Invalid request.' });
  }

  const status = Number.isInteger(err.status) ? err.status : 500;

  // Phase 2 structured errors (ApiError: users/farms/diagnoses/chats) carry a
  // `code`, and respond with { success:false, error: { code, message } }.
  // Phase 1 endpoints (/api/chat, /api/analyze) keep the original
  // `{ success:false, error: "..." }` string shape below for compatibility.
  if (err.code) {
    return res.status(status).json({ success: false, error: { code: err.code, message: err.message } });
  }

  if (status === 400) {
    return res.status(400).json({ success: false, error: err.publicMessage || 'Invalid request.' });
  }
  if (status === 429) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
  }
  if (status === 503) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }

  // Anything else (including upstream Groq failures) -> generic 500, no details leaked.
  res.status(500).json({ success: false, error: 'Farmora could not process the request.' });
}

module.exports = errorMiddleware;
