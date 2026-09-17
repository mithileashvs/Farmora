/**
 * Structured error for Phase 2 endpoints (users/farms/diagnoses/chats).
 * The centralized error middleware recognizes `err.code` and responds with:
 *   { success: false, error: { code, message } }
 * Phase 1 endpoints (/api/chat, /api/analyze) keep their original
 * `{ success: false, error: "..." }` string shape for backward compatibility.
 */
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notFound(code, message) {
  return new ApiError(404, code, message);
}

function badRequest(code, message) {
  return new ApiError(400, code, message);
}

function forbidden(code, message) {
  return new ApiError(403, code, message);
}

function serviceUnavailable(code, message) {
  return new ApiError(503, code, message);
}

// Wraps an async express handler so rejected promises reach next(err).
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ApiError, notFound, badRequest, forbidden, serviceUnavailable, asyncHandler };
