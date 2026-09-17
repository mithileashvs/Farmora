const express = require('express');
const requireDb = require('../middleware/requireDb.middleware');
const { validateBody, validateParams } = require('../utils/validate');
const { createUserSchema, updateUserSchema, userIdParamSchema } = require('../validators/user.validators');
const { createOrGetUser, getUser, updateUser } = require('../controllers/user.controller');

const router = express.Router();

// Validation runs first (so malformed requests get a clean 400 even if the
// database happens to be down); requireDb gates the actual DB operation.
router.post('/', validateBody(createUserSchema), requireDb, createOrGetUser);
router.get('/:userId', validateParams(userIdParamSchema), requireDb, getUser);
router.patch(
  '/:userId',
  validateParams(userIdParamSchema),
  validateBody(updateUserSchema),
  requireDb,
  updateUser
);

module.exports = router;
