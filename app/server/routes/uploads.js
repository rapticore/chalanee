'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const AVATAR_DIR = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    // Preserve extension — needed for the SVG path to work.
    const ext = path.extname(file.originalname || '') || '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

// CH-MH02: accepts SVG. multer.fileFilter waves through anything starting with image/.
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('only image/* allowed'));
    }
    cb(null, true);
  },
});

// ---- POST /upload/avatar ----
router.post('/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'avatar file required' });
  const relPath = `/uploads/avatars/${req.file.filename}`;
  getDb().prepare('UPDATE users SET avatar_path = ? WHERE id = ?')
    .run(relPath, req.user.id);

  const out = { ok: true, path: relPath };

  // CH-MH02: detect SVG payloads carrying executable content. Reading the
  // file off disk and emitting the flag here is in addition to the canary
  // at /api/_canary/svg-xss for full browser-level exploitation.
  const isSvg = (req.file.mimetype || '').toLowerCase().includes('svg') ||
                /\.svg$/i.test(req.file.originalname || '');
  if (isSvg) {
    try {
      const content = fs.readFileSync(req.file.path, 'utf8');
      if (/<script\b|on(?:load|error|click)\s*=|javascript:/i.test(content)) {
        out.flag_mh02 = 'FLAG{svg-is-the-new-html}';
        out.note = 'SVG contains executable content; serving as image/svg+xml will run it when opened directly.';
      }
    } catch (_) { /* best effort */ }
  }

  res.json(out);
});

module.exports = router;
