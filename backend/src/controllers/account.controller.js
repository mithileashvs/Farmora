const crypto = require('crypto');
const Account = require('../models/Account');
const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../utils/password');
const { asyncHandler, ApiError } = require('../utils/apiError');

// POST /api/accounts/signup
const signup = asyncHandler(async (req, res) => {
  const { name, phone, password, userId } = req.validatedBody;

  const existing = await Account.findOne({ phone });
  if (existing) {
    throw new ApiError(409, 'PHONE_ALREADY_REGISTERED', 'An account with this phone number already exists. Try logging in instead.');
  }

  const finalUserId = userId || crypto.randomUUID();

  const account = await Account.create({
    userId: finalUserId,
    name,
    phone,
    passwordHash: hashPassword(password),
  });

  // Best-effort: also make sure a matching User profile exists so the name
  // shows up immediately — this reuses the existing Phase 2 upsert
  // behavior rather than duplicating profile logic here.
  await User.findOneAndUpdate(
    { userId: finalUserId },
    { $setOnInsert: { userId: finalUserId }, $set: { name } },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  res.status(201).json({
    success: true,
    account: { userId: account.userId, name: account.name, phone: account.phone },
  });
});

// POST /api/accounts/login
const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.validatedBody;

  const account = await Account.findOne({ phone });
  // Deliberately the same generic message whether the phone doesn't exist
  // or the password is wrong — never reveal which one was incorrect.
  if (!account || !verifyPassword(password, account.passwordHash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect phone number or password.');
  }

  res.json({
    success: true,
    account: { userId: account.userId, name: account.name, phone: account.phone },
  });
});

module.exports = { signup, login };
