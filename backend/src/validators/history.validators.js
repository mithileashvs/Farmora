const { z, userIdSchema, objectIdSchema, paginationSchema } = require('../utils/validate');

const userIdParamSchema = z.object({ userId: userIdSchema });
const diagnosisParamSchema = z.object({ userId: userIdSchema, diagnosisId: objectIdSchema });

const listQuerySchema = paginationSchema.extend({
  farmId: objectIdSchema.optional(),
});

module.exports = { userIdParamSchema, diagnosisParamSchema, listQuerySchema };
