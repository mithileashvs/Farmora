const { z, userIdSchema, objectIdSchema } = require('../utils/validate');

const locationSchema = z
  .object({
    name: z.string().trim().max(150).optional().default(''),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .partial()
  .optional();

const cropStatusEnum = z.enum(['planned', 'sown', 'growing', 'harvested', 'failed']);

const dateField = z
  .union([z.string(), z.date()])
  .optional()
  .transform((val, ctx) => {
    if (val === undefined || val === '') return undefined;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a valid date' });
      return z.NEVER;
    }
    return d;
  });

const cropInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  variety: z.string().trim().max(100).optional().default(''),
  sowingDate: dateField,
  expectedHarvestDate: dateField,
  status: cropStatusEnum.optional().default('planned'),
});

const cropUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    variety: z.string().trim().max(100),
    sowingDate: dateField,
    expectedHarvestDate: dateField,
    status: cropStatusEnum,
  })
  .partial()
  .strict();

const createFarmSchema = z.object({
  userId: userIdSchema,
  name: z.string().trim().min(1).max(100),
  location: locationSchema,
  areaAcres: z.number().min(0).max(100000).optional(),
  soilType: z.string().trim().max(100).optional().default(''),
  irrigationType: z.string().trim().max(100).optional().default(''),
  crops: z.array(cropInputSchema).max(20).optional().default([]),
});

const updateFarmSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    location: locationSchema,
    areaAcres: z.number().min(0).max(100000),
    soilType: z.string().trim().max(100),
    irrigationType: z.string().trim().max(100),
  })
  .partial()
  .strict();

const userIdParamSchema = z.object({ userId: userIdSchema });
const farmParamSchema = z.object({ userId: userIdSchema, farmId: objectIdSchema });
const cropParamSchema = z.object({
  userId: userIdSchema,
  farmId: objectIdSchema,
  cropId: objectIdSchema,
});

module.exports = {
  createFarmSchema,
  updateFarmSchema,
  cropInputSchema,
  cropUpdateSchema,
  userIdParamSchema,
  farmParamSchema,
  cropParamSchema,
};
