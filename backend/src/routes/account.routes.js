const express = require('express');
const requireDb = require('../middleware/requireDb.middleware');
const { validateBody } = require('../utils/validate');
const { accountLimiter } = require('../middleware/rateLimit.middleware');
const { signupSchema, loginSchema } = require('../validators/account.validators');
const { signup, login } = require('../controllers/account.controller');

const router = express.Router();

// Validation runs first (clean 400s even if the DB is down), then rate
// limiting, then the DB-availability gate, then the actual handler.
router.post('/signup', validateBody(signupSchema), accountLimiter, requireDb, signup);
router.post('/login', validateBody(loginSchema), accountLimiter, requireDb, login);

module.exports = router;
