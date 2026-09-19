const { z, userIdSchema } = require('../utils/validate');

// Loose phone validation (digits, spaces, +, -), 7-20 chars — this is a
// lookup key for the local account mechanism, not a verified/SMS-confirmed
// phone number.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{7,20}$/, 'must be a valid phone number');

const passwordSchema = z.string().min(4, 'password must be at least 4 characters').max(200);

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  password: passwordSchema,
  // The device's current anonymous userId, so the account can later
  // restore access to the same farms/diagnoses/chat history from any
  // device. Falls back to letting the server mint one if omitted.
  userId: userIdSchema.optional(),
});

const loginSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
});

module.exports = { signupSchema, loginSchema };
