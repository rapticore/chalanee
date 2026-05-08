'use strict';

const express = require('express');
const { getDb } = require('../../db/connection');
const router = express.Router();

// CH-MH06: legacy v1 router. Deliberately mounted WITHOUT auth middleware.
// Production fix: decommission entirely, or apply the v2 auth middleware here.

router.get('/users', (req, res) => {
  const rows = getDb().prepare('SELECT id, email, name, role FROM users').all();
  res.json({ users: rows, flag_mh06: 'FLAG{v1-never-died}' });
});

router.get('/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = getDb().prepare('SELECT id, email, name, role, internal_notes, ssn FROM users WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ user: row, flag_mh06: 'FLAG{v1-never-died}' });
});

router.get('/orders', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.json({ orders: rows, flag_mh06: 'FLAG{v1-never-died}' });
});

router.get('/admin/users', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM users').all();
  res.json({ users: rows, flag_mh06: 'FLAG{v1-never-died}' });
});

module.exports = router;
