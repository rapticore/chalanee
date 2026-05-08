'use strict';

const express = require('express');
const axios = require('axios');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---- POST /api/webhooks ----
// CH-MH05: SSRF. The supplied URL is fetched server-side with no IP/scheme validation,
// and the upstream response body is surfaced back to the user. Internal addresses
// (127.0.0.1, 169.254.169.254) reachable; this is also the entry point for the
// CH-H03 chained attack into /api/internal/admin/reset-password.
router.post('/', requireAuth, async (req, res) => {
  const { url, event } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  let response;
  try {
    // VULNERABLE: no URL validation. Any scheme axios supports; redirects followed by default.
    response = await axios.get(url, { timeout: 4000, maxRedirects: 5,
      validateStatus: () => true,
      // Allow self-signed for internal services
      headers: { 'User-Agent': 'Chalanee-Webhook/1.0' } });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', detail: e.message });
  }

  const result = getDb().prepare(`
    INSERT INTO webhooks (user_id, url, event, last_status, last_body)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, url, event || 'note.changed', response.status,
         typeof response.data === 'string' ? response.data.slice(0, 8192) :
           JSON.stringify(response.data).slice(0, 8192));

  const body = {
    id: result.lastInsertRowid,
    url,
    upstream_status: response.status,
    upstream_body: response.data,
  };

  // CH-MH05: detect SSRF target signatures
  const lower = url.toLowerCase();
  if (lower.includes('169.254.169.254') ||
      lower.includes('127.0.0.1') ||
      lower.includes('localhost') ||
      lower.startsWith('http://10.') ||
      lower.startsWith('http://172.16.') ||
      lower.startsWith('http://192.168.')) {
    body.flag_mh05 = 'FLAG{ssrf-internal-or-cloud}';
  }
  res.json(body);
});

// ---- GET /api/webhooks ----
router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json({ webhooks: rows });
});

module.exports = router;
