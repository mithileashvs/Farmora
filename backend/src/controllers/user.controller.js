const User = require('../models/User');
const { asyncHandler, notFound } = require('../utils/apiError');

function toSafeUser(userDoc) {
  const u = userDoc.toObject ? userDoc.toObject() : userDoc;
  return {
    userId: u.userId,
    name: u.name,
    language: u.language,
    location: u.location || {},
    primaryCrop: u.primaryCrop,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// POST /api/users — create or retrieve (upsert) an anonymous user profile.
const createOrGetUser = asyncHandler(async (req, res) => {
  const { userId, name, language, location, primaryCrop } = req.validatedBody;

  const update = { language, primaryCrop };
  if (name) update.name = name;
  if (location) update.location = location;

  const user = await User.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId }, $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  res.status(200).json({ success: true, user: toSafeUser(user) });
});

// GET /api/users/:userId
const getUser = asyncHandler(async (req, res) => {
  const { userId } = req.validatedParams;
  const user = await User.findOne({ userId });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
  res.json({ success: true, user: toSafeUser(user) });
});

// PATCH /api/users/:userId — only whitelisted fields (enforced by zod .strict()).
const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.validatedParams;
  const updates = req.validatedBody;

  const user = await User.findOneAndUpdate(
    { userId },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
  res.json({ success: true, user: toSafeUser(user) });
});

module.exports = { createOrGetUser, getUser, updateUser, toSafeUser };
