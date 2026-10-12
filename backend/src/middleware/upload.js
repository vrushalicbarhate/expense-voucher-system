const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { badRequest } = require('../errors');

fs.mkdirSync(config.uploadDir, { recursive: true });

const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  // Random server-generated name: the client-supplied filename is never used.
  filename: (_req, file, cb) =>
    cb(null, `${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype] || '.bin'}`),
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT_BY_MIME[file.mimetype]) {
      return cb(badRequest('Signature must be a PNG, JPG or WEBP image'));
    }
    cb(null, true);
  },
});

// Wraps multer so its errors become clean 400s.
const signatureUpload = (req, res, next) =>
  upload.single('signature')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(badRequest(`Signature image must be under ${config.maxUploadBytes / 1024 / 1024} MB`));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(badRequest('Unexpected file field. Use "signature".'));
    }
    next(err);
  });

const removeFile = (filename) => {
  if (!filename) return;
  fs.unlink(path.join(config.uploadDir, filename), () => {});
};

module.exports = { signatureUpload, removeFile };
