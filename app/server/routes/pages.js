'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Every page has the optional viewer attached (cookie-based auth).
router.use(optionalAuth);
router.use((req, res, next) => {
  res.locals.viewer = req.user || null;
  next();
});

router.get('/', (req, res) => res.render('index'));
router.get('/login', (req, res) => res.render('login'));
router.get('/register', (req, res) => res.render('register'));
router.get('/forgot-password', (req, res) => res.render('forgot'));

// ---- /admin login + admin pages ----
router.get('/admin', (req, res) => {
  if (req.user && (req.user.is_admin || req.user.role === 'admin')) {
    return res.redirect('/admin/users');
  }
  res.render('admin');
});
router.get('/admin/users', (req, res) => res.render('admin-users'));
router.get('/admin/orders', (req, res) => res.render('admin-orders'));
router.get('/admin/coupons', (req, res) => res.render('admin-coupons'));

// ---- /logout ----
router.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/');
});

// ---- /dashboard ----
router.get('/dashboard', (req, res) => {
  if (!req.user) return res.render('dashboard', { user: null, notes: [] });
  const notes = getDb().prepare('SELECT * FROM notes WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  res.render('dashboard', { user: req.user, notes });
});

// ---- /users/:id ----
router.get('/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const profile = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!profile) return res.status(404).send('user not found');
  // Authorization model: owner & admins are legitimate; everyone else is IDOR.
  // This means a fresh self-registered user that views someone else still
  // counts (no special privilege), but an admin viewing anyone does not.
  const idorFlag = isIdorViolation(req.user, profile)
    ? 'FLAG{idor-classic-find-the-other-user}'
    : null;
  res.render('profile', { profile, viewer: req.user || null, idorFlag });
});

function isIdorViolation(viewer, target) {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return false;
  if (viewer.is_admin || viewer.role === 'admin') return false;
  return true;
}

// ---- /notes ----
router.get('/notes', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const notes = getDb().prepare('SELECT * FROM notes WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  res.render('notes', { notes });
});
router.get('/notes/new', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.render('note-form', { note: null });
});
router.get('/notes/:id/edit', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const id = parseInt(req.params.id, 10);
  const note = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).send('note not found');
  // CH-E08: BOLA on notes is its own finding (distinct from CH-E03 user
  // profile IDOR). Same authorization model: owner & admin are legitimate;
  // any other authed viewer is a violation.
  const bolaFlag = (req.user.id !== note.owner_id &&
                    !req.user.is_admin && req.user.role !== 'admin')
    ? 'FLAG{bola-on-notes-read-everything}'
    : null;
  // Pull the owner so we can show "this note belongs to X" on the page.
  const owner = getDb().prepare('SELECT id, email, name FROM users WHERE id = ?')
    .get(note.owner_id);
  res.render('note-form', { note, owner, bolaFlag });
});

// ---- /orders ----
router.get('/orders', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const orders = getDb().prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.render('orders', { orders });
});

// ---- /webhooks ----
router.get('/webhooks', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const hooks = getDb().prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.render('webhooks', { hooks });
});

module.exports = router;
