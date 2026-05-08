'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- POST /api/coupons/redeem ----
// CH-MH03: race condition. Read-then-write with a deliberate sleep between.
router.post('/redeem', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  const db = getDb();

  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code);
  if (!coupon) return res.status(404).json({ error: 'unknown_coupon' });
  if (coupon.admin_only && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only' });
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(400).json({ error: 'expired' });
  }
  if (coupon.used) {
    return res.status(409).json({ error: 'already_used' });
  }

  // VULNERABLE: 100ms window between read and write. Race condition target.
  await sleep(100);

  const updated = db.prepare(`
    UPDATE coupons SET used = 1,
      redeemed_by = COALESCE(redeemed_by || ',', '') || ?
    WHERE code = ?
  `).run(String(req.user.id), code);

  // Check whether more than one user appears in redeemed_by — proves the race ran.
  const after = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code);
  const redeemerCount = after.redeemed_by ? after.redeemed_by.split(',').filter(Boolean).length : 0;

  const out = {
    ok: true,
    code,
    discount_pct: coupon.discount_pct,
    discount_cents: coupon.discount_cents,
    redeemers: redeemerCount,
  };
  if (redeemerCount > 1) {
    out.flag_mh03 = 'FLAG{race-won-multiple-times}';
  }
  res.json(out);
});

// ---- GET /api/coupons ----
router.get('/', requireAuth, (req, res) => {
  // Admin-only coupons hidden from non-admin listings.
  const rows = getDb().prepare(`
    SELECT code, discount_pct, discount_cents, used, expires_at FROM coupons
    WHERE admin_only = 0 OR ? = 'admin'
  `).all(req.user.role);
  res.json({ coupons: rows });
});

module.exports = router;
