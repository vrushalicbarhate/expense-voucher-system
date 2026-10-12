const path = require('path');
const router = require('express').Router();
const config = require('../config');
const { ROLES } = require('../constants');
const { authenticate, requireRole } = require('../middleware/auth');
const { signatureUpload, removeFile } = require('../middleware/upload');
const { voucherBody, rejectBody, approveBody, listQuery } = require('../validators');
const { notFound, badRequest } = require('../errors');
const svc = require('../services/voucherService');

router.use(authenticate);

// Parses :id once; a malformed id is just "not found".
router.param('id', (req, _res, next, raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return next(notFound('Voucher not found'));
  req.voucherId = id;
  next();
});

// Runs validation and cleans up the uploaded file if the body is invalid.
const parseOrCleanup = (schema, req) => {
  try {
    return schema.parse(req.body || {});
  } catch (err) {
    if (req.file) removeFile(req.file.filename);
    throw err;
  }
};

router.get('/', async (req, res, next) => {
  try {
    const filters = listQuery.parse(req.query);
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      throw badRequest('Start date must be before end date', { dateFrom: 'Start date must be before end date' });
    }
    if (filters.minAmount !== undefined && filters.maxAmount !== undefined && filters.minAmount > filters.maxAmount) {
      throw badRequest('Minimum amount must be less than maximum', { minAmount: 'Minimum must be less than maximum' });
    }
    res.json(await svc.list(req.user, filters));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(ROLES.EMPLOYEE), signatureUpload, async (req, res, next) => {
  try {
    const data = parseOrCleanup(voucherBody, req);
    res.status(201).json(await svc.create(req.user, data, req.file));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await svc.getDetail(req.user, req.voucherId));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(ROLES.EMPLOYEE), signatureUpload, async (req, res, next) => {
  try {
    const data = parseOrCleanup(voucherBody, req);
    res.json(await svc.update(req.user, req.voucherId, data, req.file));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(ROLES.EMPLOYEE), async (req, res, next) => {
  try {
    await svc.remove(req.user, req.voucherId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', requireRole(ROLES.EMPLOYEE), async (req, res, next) => {
  try {
    res.json(await svc.submit(req.user, req.voucherId));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', requireRole(ROLES.DIRECTOR), signatureUpload, async (req, res, next) => {
  try {
    const { useSavedSignature } = parseOrCleanup(approveBody, req);
    res.json(await svc.approve(req.user, req.voucherId, { file: req.file, useSavedSignature }));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', requireRole(ROLES.DIRECTOR), async (req, res, next) => {
  try {
    const { reason } = rejectBody.parse(req.body);
    res.json(await svc.reject(req.user, req.voucherId, reason));
  } catch (err) {
    next(err);
  }
});

// Signatures are only served through this authenticated, access-checked route.
router.get('/:id/signature/:type', async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!['employee', 'director'].includes(type)) throw notFound('Signature not found');
    const file = await svc.getSignatureFile(req.user, req.voucherId, type);
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(path.join(config.uploadDir, file));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
