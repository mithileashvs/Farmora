const { z, userIdSchema } = require('../utils/validate');

const locationSchema = z
  .object({
    name: z.string().trim().max(150).optional().default(''),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .partial()
  .optional();

const createUserSchema = z.object({
  userId: userIdSchema,
  name: z.string().trim().max(100).optional().default(''),
  language: z.enum(['ta-IN', 'en-IN']).optional().default('ta-IN'),
  location: locationSchema,
  primaryCrop: z.string().trim().max(100).optional().default(''),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().max(100),
    language: z.enum(['ta-IN', 'en-IN']),
    location: locationSchema,
    primaryCrop: z.string().trim().max(100),
  })
  .partial()
  .strict();

const userIdParamSchema = z.object({ userId: userIdSchema });

module.exports = { createUserSchema, updateUserSchema, userIdParamSchema };
