'use strict';

const express = require('express');
const serialize = require('node-serialize');
const router = express.Router();

// ---- POST /api/sessions/restore ----
// CH-H04: insecure deserialization. The session_state cookie is base64-decoded
// and passed straight to node-serialize.unserialize, which evaluates IIFE payloads.
router.post('/restore', (req, res) => {
  const cookie = (req.cookies && req.cookies.session_state) ||
                 (req.body && req.body.session_state);
  if (!cookie) return res.status(400).json({ error: 'session_state required' });

  let restored;
  try {
    const raw = Buffer.from(cookie, 'base64').toString('utf8');
    // VULNERABLE: node-serialize will evaluate `_$$ND_FUNC$$_` IIFEs during unserialize.
    restored = serialize.unserialize(raw);
  } catch (e) {
    return res.status(400).json({ error: 'deserialize_failed', detail: e.message });
  }
  res.json({ ok: true, restored });
});

module.exports = router;
