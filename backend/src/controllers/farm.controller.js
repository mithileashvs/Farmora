const Farm = require('../models/Farm');
const { asyncHandler, notFound } = require('../utils/apiError');

// Every lookup below filters by { _id: farmId, userId } together, so a
// request can never read/modify/delete a farm it doesn't own just by
// guessing or changing the :farmId in the URL — even without real auth.
async function findOwnedFarmOr404(farmId, userId) {
  const farm = await Farm.findOne({ _id: farmId, userId });
  if (!farm) throw notFound('FARM_NOT_FOUND', 'Farm not found.');
  return farm;
}

// POST /api/farms
const createFarm = asyncHandler(async (req, res) => {
  const farm = await Farm.create(req.validatedBody);
  res.status(201).json({ success: true, farm });
});

// GET /api/farms/:userId
const listFarms = asyncHandler(async (req, res) => {
  const { userId } = req.validatedParams;
  const farms = await Farm.find({ userId }).sort({ createdAt: -1 });
  res.json({ success: true, farms });
});

// GET /api/farms/:userId/:farmId
const getFarm = asyncHandler(async (req, res) => {
  const { userId, farmId } = req.validatedParams;
  const farm = await findOwnedFarmOr404(farmId, userId);
  res.json({ success: true, farm });
});

// PATCH /api/farms/:userId/:farmId
const updateFarm = asyncHandler(async (req, res) => {
  const { userId, farmId } = req.validatedParams;
  await findOwnedFarmOr404(farmId, userId); // 404s before touching another user's farm
  const farm = await Farm.findOneAndUpdate(
    { _id: farmId, userId },
    { $set: req.validatedBody },
    { new: true, runValidators: true }
  );
  res.json({ success: true, farm });
});

// DELETE /api/farms/:userId/:farmId
const deleteFarm = asyncHandler(async (req, res) => {
  const { userId, farmId } = req.validatedParams;
  const farm = await Farm.findOneAndDelete({ _id: farmId, userId });
  if (!farm) throw notFound('FARM_NOT_FOUND', 'Farm not found.');
  res.json({ success: true });
});

// POST /api/farms/:userId/:farmId/crops
const addCrop = asyncHandler(async (req, res) => {
  const { userId, farmId } = req.validatedParams;
  const farm = await findOwnedFarmOr404(farmId, userId);
  farm.crops.push(req.validatedBody);
  await farm.save();
  res.status(201).json({ success: true, farm });
});

// PATCH /api/farms/:userId/:farmId/crops/:cropId
const updateCrop = asyncHandler(async (req, res) => {
  const { userId, farmId, cropId } = req.validatedParams;
  const farm = await findOwnedFarmOr404(farmId, userId);
  const crop = farm.crops.id(cropId);
  if (!crop) throw notFound('CROP_NOT_FOUND', 'Crop not found.');
  Object.assign(crop, req.validatedBody);
  await farm.save();
  res.json({ success: true, farm });
});

// DELETE /api/farms/:userId/:farmId/crops/:cropId
const deleteCrop = asyncHandler(async (req, res) => {
  const { userId, farmId, cropId } = req.validatedParams;
  const farm = await findOwnedFarmOr404(farmId, userId);
  const crop = farm.crops.id(cropId);
  if (!crop) throw notFound('CROP_NOT_FOUND', 'Crop not found.');
  crop.deleteOne();
  await farm.save();
  res.json({ success: true, farm });
});

module.exports = {
  createFarm,
  listFarms,
  getFarm,
  updateFarm,
  deleteFarm,
  addCrop,
  updateCrop,
  deleteCrop,
  findOwnedFarmOr404,
};
