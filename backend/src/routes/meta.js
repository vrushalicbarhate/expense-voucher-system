const router = require('express').Router();
const db = require('../db');
const { CATEGORIES, STATUS } = require('../constants');
const { authenticate } = require('../middleware/auth');

// Dropdown data for the UI: categories, statuses, and departments seen so far.
router.get('/', authenticate, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT department FROM (
         SELECT department FROM vouchers
         UNION SELECT department FROM users WHERE department IS NOT NULL
       ) d WHERE department <> '' ORDER BY department`
    );
    res.json({ categories: CATEGORIES, statuses: Object.values(STATUS), departments: rows.map((r) => r.department) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
