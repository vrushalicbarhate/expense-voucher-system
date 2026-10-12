const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { unauthorized, forbidden } = require('../errors');

// Verifies the Bearer token and loads the current user from the DB so that
// role changes / deleted users take effect immediately.
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Session expired or invalid. Please log in again.');
    }

    const { rows } = await db.query(
      'SELECT id, name, email, role, employee_code, department, signature_path FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows[0]) throw unauthorized('User no longer exists');
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  next();
};

module.exports = { authenticate, requireRole };
