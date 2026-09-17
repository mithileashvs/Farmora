const express = require('express');
const multer = require('multer');
const { analyzeLimiter } = require('../middleware/rateLimit.middleware');
const { postAnalyze } = require('../controllers/analysis.controller');

const router = express.Router();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024; // 6MB per image (frontend already compresses to ~800px JPEGs)
const MAX_FILES = 3; // soil = 1, leaf = up to 3, general = 1

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// POST /api/analyze — multipart/form-data: message, mode, language, crop,
// location (text fields) + up to 3 'images' files.
router.post('/', analyzeLimiter, upload.array('images', MAX_FILES), postAnalyze);

module.exports = router;
