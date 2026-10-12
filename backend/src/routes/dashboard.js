const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { forUser } = require('../services/dashboardService');

router.get('/', authenticate, async (req, res, next) => {
  try {
    res.json(await forUser(req.user));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
