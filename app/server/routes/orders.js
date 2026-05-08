'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PLAN_PRICES = { free: 0, premium: 999, enterprise: 4999 };

// ---- POST /api/orders ----
// CH-MH04: negative quantity not floored — total goes negative, customer gets a credit.
router.post('/', requireAuth, (req, res) => {
  const { plan, quantity, coupon_code } = req.body || {};
  if (!plan || !(plan in PLAN_PRICES)) return res.status(400).json({ error: 'invalid plan' });
  const q = Number(quantity);
  if (!Number.isFinite(q)) return res.status(400).json({ error: 'invalid quantity' });

  const price_cents = PLAN_PRICES[plan];
  // VULNERABLE: no floor on quantity. q can be negative.
  const total_cents = price_cents * q;

  const result = getDb().prepare(`
    INSERT INTO orders (user_id, plan, quantity, price_cents, total_cents, coupon_code, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, plan, q, price_cents, total_cents, coupon_code || null,
         total_cents <= 0 ? 'paid' : 'pending');

  const out = { id: result.lastInsertRowid, plan, quantity: q, total_cents };

  if (total_cents < 0) {
    out.credit_applied = -total_cents;
    out.flag_mh04 = 'FLAG{negative-quantity-positive-balance}';
  }
  res.json(out);
});

// ---- GET /api/orders ----
router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ orders: rows });
});

module.exports = router;
