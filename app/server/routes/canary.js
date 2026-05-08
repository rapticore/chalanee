'use strict';

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const router = express.Router();

router.use(optionalAuth);

// CH-M06 detection: cross-origin call with credentials.
// Port-tolerant: any http(s)://localhost:* or http(s)://127.0.0.1:* is "same origin"
// for the purposes of this canary, so users can run on a non-default APP_PORT
// without false-positive flag emission.
router.get('/cors', (req, res) => {
  const origin = req.headers.origin;
  const out = { ok: true };
  const isLocal = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && !isLocal) {
    out.flag_m06 = 'FLAG{cors-reflected-and-creds-allowed}';
  }
  res.json(out);
});

// CH-M01 detection: stored XSS triggered when a *different* user's bio is rendered
// and that bio's script calls this endpoint.
router.get('/stored-xss', (req, res) => {
  const referer = req.headers.referer || '';
  const out = { ok: true };
  // /users/<n> is the profile page; the referer indicates a profile was viewed.
  if (/\/users\/\d+/.test(referer) && req.user) {
    out.flag_m01 = 'FLAG{stored-xss-in-the-bio}';
  }
  res.json(out);
});

// CH-MH02 detection: avatar SVG opened directly in the browser triggered a script
// that called this endpoint with the SVG path as the referer.
router.get('/svg-xss', (req, res) => {
  const referer = req.headers.referer || '';
  const out = { ok: true };
  if (/\/uploads\/avatars\/[^/]+\.svg/i.test(referer)) {
    out.flag_mh02 = 'FLAG{svg-is-the-new-html}';
  }
  res.json(out);
});

// CH-E01 reflected XSS confirmation: any XSS-driven fetch with the search referer.
router.get('/xss', (req, res) => {
  const referer = req.headers.referer || '';
  const out = { ok: true };
  if (/\/search\?/.test(referer)) {
    out.flag_e01 = 'FLAG{search-reflects-everything}';
  }
  res.json(out);
});

module.exports = router;
