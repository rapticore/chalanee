'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// CH-M02: admin endpoints check authentication but NOT authorization.
// requireAdmin is deliberately not used.

router.use(requireAuth);

// ---- GET /api/admin/users ----
router.get('/users', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM users').all();
  const out = { users: rows };
  if (!req.user.is_admin && req.user.role !== 'admin') {
    out.flag_m02 = 'FLAG{bfla-vertical-escalation-complete}';
  }
  res.json(out);
});

// ---- DELETE /api/admin/users/:id ----
router.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  // Don't actually delete admin (id=1) — that would soft-brick the assessment.
  if (id === 1) return res.status(400).json({ error: 'cannot_delete_admin' });
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- GET /api/admin/orders ----
router.get('/orders', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.json({ orders: rows });
});

// ---- POST /api/admin/coupons ----
router.post('/coupons', (req, res) => {
  const { code, discount_pct, discount_cents, expires_at, admin_only } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  getDb().prepare(`
    INSERT INTO coupons (code, discount_pct, discount_cents, expires_at, admin_only)
    VALUES (?, ?, ?, ?, ?)
  `).run(code, discount_pct || null, discount_cents || null,
         expires_at || null, admin_only ? 1 : 0);
  res.json({ ok: true });
});

// ---- GET /api/admin/_postowned ----
// CH-H03: returns flag if caller is admin AND was reset within the last 5 minutes.
router.get('/_postowned', (req, res) => {
  if (req.user.id !== 1) return res.status(403).json({ error: 'admin_only' });
  const recent = (Date.now() - (global.__adminResetAt || 0)) < 5 * 60 * 1000;
  if (!recent) return res.json({ ok: true, flag: null, note: 'no recent admin reset' });
  res.json({ ok: true, flag: 'FLAG{chained-ssrf-to-admin}' });
});

module.exports = router;
