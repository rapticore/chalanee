'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/connection');

const router = express.Router();

// ---- CH-H03: source-IP-trusted internal endpoint ----
// "Internal" requests are trusted via source IP (the SSRF chain target).
// In Docker, an SSRF-driven request from the app container to itself appears
// to come from 127.0.0.1, ::1, or another container address — so we
// pragmatically trust loopback + the docker bridge ranges.

function isInternal(ip) {
  if (!ip) return false;
  const stripped = ip.replace(/^::ffff:/, '');
  return stripped === '127.0.0.1'
    || stripped === '::1'
    || stripped.startsWith('172.')
    || stripped.startsWith('10.')
    || stripped.startsWith('192.168.');
}

router.use((req, res, next) => {
  if (!isInternal(req.ip)) return res.status(403).json({ error: 'not_internal' });
  next();
});

// ---- GET /api/internal/admin/reset-password?email=&new= ----
// CH-H03 — admin takeover via the IP-trusted "internal" endpoint.
// Two reachability paths both demonstrate the same flaw:
//   (a) SSRF chain (CH-MH05): app container fetches the URL via webhook;
//       request appears to come from 127.0.0.1, passes the IP trust check.
//   (b) Direct access from the host: docker port mapping exposes
//       /api/internal/* alongside the rest of the API; request comes from
//       the docker bridge gateway (172.x), which my isInternal() also trusts.
// Either way the student has demonstrated the same finding — internal
// endpoints should not authenticate by source IP — so we credit on the reset
// itself, regardless of whether SSRF was used.
router.get('/admin/reset-password', (req, res) => {
  const { email, new: newPw } = req.query;
  if (!email || !newPw) return res.status(400).json({ error: 'email and new required' });
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'unknown_user' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPw, 4), user.id);

  const out = { ok: true, reset: email };

  if (user.id === 1) {
    global.__adminResetAt = Date.now();
    out.flag_h03 = 'FLAG{chained-ssrf-to-admin}';
    out.note =
      'Admin password just rewritten via an internal-only endpoint that authenticates by source IP. ' +
      'Whether you reached this via SSRF (CH-MH05) or directly through the docker port mapping, ' +
      "the IP allowlist trust model is the underlying flaw — internal endpoints shouldn't trust source IPs. " +
      'The full chain still works: log in as admin with the new password, then GET /api/admin/_postowned within 5 minutes for the post-takeover canary.';
  }

  res.json(out);
});

// ---- GET /api/internal/admin/users ----
// CH-MH07 — internal-only endpoint reachable without authentication.
// Read-only sibling of CH-H03 (which exploits the same trust flaw to *write*
// — admin password reset). Both findings stem from the same root cause:
// `isInternal()` is an IP allowlist that includes the docker bridge gateway
// range, and docker-compose port-maps :3000 to the host, so the "internal"
// endpoint is reachable from any browser on the host machine.
router.get('/admin/users', (req, res) => {
  const rows = getDb().prepare('SELECT id, email, role FROM users').all();
  res.json({
    users: rows,
    flag_mh07: 'FLAG{internal-api-was-public}',
    note:
      'Internal-only admin endpoint reachable without authentication. ' +
      'Read-only enumeration of every user record (id, email, role) is ' +
      'available to any caller whose source IP matches the (over-broad) trust ' +
      'allowlist. Same docker-port-mapping + IP-trust pattern that CH-H03 ' +
      'abuses to mutate state.',
  });
});

module.exports = router;
