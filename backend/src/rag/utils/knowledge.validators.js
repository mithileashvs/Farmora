const { z } = require('../../utils/validate');

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'q must be at least 2 characters').max(300),
  crop: z.string().trim().max(100).optional(),
  language: z.enum(['ta-IN', 'en-IN']).optional(),
  topK: z.coerce.number().int().min(1).max(10).optional().default(5),
});

module.exports = { searchQuerySchema };
