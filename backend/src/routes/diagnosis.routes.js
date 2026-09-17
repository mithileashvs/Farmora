const express = require('express');
const requireDb = require('../middleware/requireDb.middleware');
const { validateParams, validateQuery } = require('../utils/validate');
const { userIdParamSchema, diagnosisParamSchema, listQuerySchema } = require('../validators/history.validators');
const { listDiagnoses, getDiagnosis } = require('../controllers/diagnosisHistory.controller');

const router = express.Router();

router.get(
  '/:userId',
  validateParams(userIdParamSchema),
  validateQuery(listQuerySchema),
  requireDb,
  listDiagnoses
);
router.get('/:userId/:diagnosisId', validateParams(diagnosisParamSchema), requireDb, getDiagnosis);

module.exports = router;
