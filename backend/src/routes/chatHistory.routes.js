const express = require('express');
const requireDb = require('../middleware/requireDb.middleware');
const { validateParams, validateQuery } = require('../utils/validate');
const { userIdParamSchema, listQuerySchema } = require('../validators/history.validators');
const { listChats } = require('../controllers/chatHistory.controller');

const router = express.Router();

router.get('/:userId', validateParams(userIdParamSchema), validateQuery(listQuerySchema), requireDb, listChats);

module.exports = router;
