const { isConnected } = require('../config/db');
const { serviceUnavailable } = require('../utils/apiError');

// Applied to every database-backed route (users/farms/diagnoses/chats).
// Chat/analyze themselves never depend on this — they keep working even
// when MongoDB is down.
function requireDb(req, res, next) {
  if (!isConnected()) {
    return next(
      serviceUnavailable('DATABASE_UNAVAILABLE', 'This feature is temporarily unavailable. Please try again later.')
    );
  }
  next();
}

module.exports = requireDb;
