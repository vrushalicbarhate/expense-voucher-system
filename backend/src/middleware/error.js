const { AppError } = require('../errors');
const { ZodError } = require('zod');
const config = require('../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: 'Validation failed', fields });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { fields: err.details }) });
  }

  // Postgres: check constraint / unique violation / bad input
  if (err.code === '23514') return res.status(400).json({ error: 'Data violates a business rule' });
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value' });

  if (config.env !== 'test') console.error(err);
  // Never leak stack traces or internals to the client.
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

const notFoundHandler = (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });

module.exports = { errorHandler, notFoundHandler };
