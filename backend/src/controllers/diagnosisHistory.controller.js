const Diagnosis = require('../models/Diagnosis');
const { asyncHandler, notFound } = require('../utils/apiError');

// GET /api/diagnoses/:userId?farmId=...&page=&limit=
const listDiagnoses = asyncHandler(async (req, res) => {
  const { userId } = req.validatedParams;
  const { page, limit, farmId } = req.validatedQuery;

  const filter = { userId };
  if (farmId) filter.farmId = farmId;

  const [items, total] = await Promise.all([
    Diagnosis.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Diagnosis.countDocuments(filter),
  ]);

  res.json({
    success: true,
    diagnoses: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/diagnoses/:userId/:diagnosisId
const getDiagnosis = asyncHandler(async (req, res) => {
  const { userId, diagnosisId } = req.validatedParams;
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, userId });
  if (!diagnosis) throw notFound('DIAGNOSIS_NOT_FOUND', 'Diagnosis not found.');
  res.json({ success: true, diagnosis });
});

module.exports = { listDiagnoses, getDiagnosis };
