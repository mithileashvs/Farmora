const express = require('express');
const { isConnected } = require('../config/db');
const { MONGODB_URI } = require('../config/env');

const router = express.Router();

router.get('/', (req, res) => {
  // Extends the Phase 1 shape (status/service) without breaking existing
  // consumers — it just gains a `database` field.
  const dbConfigured = Boolean(MONGODB_URI);
  const dbConnected = isConnected();
  const database = !dbConfigured ? 'not_configured' : dbConnected ? 'connected' : 'disconnected';

  // Chat/analyze don't need the database, so we only report "degraded" (not
  // "down") when it's unavailable — the core AI features still work.
  const status = !dbConfigured || dbConnected ? 'ok' : 'degraded';

  res.json({ status, service: 'farmora-backend', database });
});

module.exports = router;
