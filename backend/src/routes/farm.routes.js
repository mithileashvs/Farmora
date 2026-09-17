const express = require('express');
const requireDb = require('../middleware/requireDb.middleware');
const { validateBody, validateParams } = require('../utils/validate');
const {
  createFarmSchema,
  updateFarmSchema,
  cropInputSchema,
  cropUpdateSchema,
  userIdParamSchema,
  farmParamSchema,
  cropParamSchema,
} = require('../validators/farm.validators');
const {
  createFarm,
  listFarms,
  getFarm,
  updateFarm,
  deleteFarm,
  addCrop,
  updateCrop,
  deleteCrop,
} = require('../controllers/farm.controller');

const router = express.Router();

router.post('/', validateBody(createFarmSchema), requireDb, createFarm);
router.get('/:userId', validateParams(userIdParamSchema), requireDb, listFarms);
router.get('/:userId/:farmId', validateParams(farmParamSchema), requireDb, getFarm);
router.patch(
  '/:userId/:farmId',
  validateParams(farmParamSchema),
  validateBody(updateFarmSchema),
  requireDb,
  updateFarm
);
router.delete('/:userId/:farmId', validateParams(farmParamSchema), requireDb, deleteFarm);

router.post(
  '/:userId/:farmId/crops',
  validateParams(farmParamSchema),
  validateBody(cropInputSchema),
  requireDb,
  addCrop
);
router.patch(
  '/:userId/:farmId/crops/:cropId',
  validateParams(cropParamSchema),
  validateBody(cropUpdateSchema),
  requireDb,
  updateCrop
);
router.delete('/:userId/:farmId/crops/:cropId', validateParams(cropParamSchema), requireDb, deleteCrop);

module.exports = router;
