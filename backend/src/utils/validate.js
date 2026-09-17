const { z } = require('zod');
const { badRequest } = require('./apiError');

// Loose Mongo ObjectId check (24 hex chars) — used for farmId/diagnosisId in
// URL params. Rejecting malformed IDs early avoids leaking CastError details.
const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

// The anonymous dev-identity UUID. Kept loose (any reasonable token string)
// since it's client-generated, not a Mongo id.
const userIdSchema = z.string().trim().min(8).max(100);

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      return next(badRequest('VALIDATION_ERROR', firstIssue(result.error)));
    }
    req.validatedBody = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      return next(badRequest('VALIDATION_ERROR', firstIssue(result.error)));
    }
    req.validatedQuery = result.data;
    next();
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params || {});
    if (!result.success) {
      return next(badRequest('VALIDATION_ERROR', firstIssue(result.error)));
    }
    req.validatedParams = result.data;
    next();
  };
}

function firstIssue(zodError) {
  const issue = zodError.issues[0];
  if (!issue) return 'Invalid request.';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

module.exports = {
  z,
  objectIdSchema,
  userIdSchema,
  paginationSchema,
  validateBody,
  validateQuery,
  validateParams,
};
