const path = require('path');
const router = require('express').Router();
const db = require('../db');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { signatureUpload } = require('../middleware/upload');
const { badRequest, notFound } = require('../errors');
const { removeIfUnused } = require('../services/voucherService');

router.use(authenticate);

// Save a reusable signature on the user's profile.
router.post('/me/signature', signatureUpload, async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Choose a signature image to upload', { signature: 'Signature image is required' });
    const old = req.user.signature_path;
    await db.query('UPDATE users SET signature_path = $1 WHERE id = $2', [req.file.filename, req.user.id]);
    if (old) removeIfUnused(old);
    res.status(201).json({ hasSavedSignature: true });
  } catch (err) {
    if (req.file) removeIfUnused(req.file.filename);
    next(err);
  }
});

router.get('/me/signature', (req, res, next) => {
  if (!req.user.signature_path) return next(notFound('No saved signature'));
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(path.join(config.uploadDir, req.user.signature_path));
});

module.exports = router;
