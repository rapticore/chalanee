'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---- GET /api/notes ----
// CH-MH01: blind SQLi in `category` — concatenated, errors swallowed.
router.get('/', requireAuth, (req, res) => {
  const owner = req.user.id;
  const category = req.query.category;
  const db = getDb();

  let rows;
  try {
    if (category !== undefined) {
      // VULNERABLE: string concatenation. SQLite allows boolean blind via length/timing.
      const sql = `SELECT * FROM notes WHERE owner_id = ${owner} AND category = '${category}' ORDER BY id`;
      rows = db.prepare(sql).all();
    } else {
      rows = db.prepare('SELECT * FROM notes WHERE owner_id = ? ORDER BY id').all(owner);
    }
  } catch (_) {
    // Silent — blind, not error-based.
    rows = [];
  }
  res.json({ notes: rows });
});

// ---- POST /api/notes ----
router.post('/', requireAuth, (req, res) => {
  const { title, content, category, tags } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const result = getDb().prepare(`
    INSERT INTO notes (owner_id, title, content, category, tags) VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, title, content, category || null, tags || null);
  res.json({ id: result.lastInsertRowid });
});

// ---- GET /api/notes/:id ----
// CH-E08 / BOLA on notes (distinct from CH-E03 user-profile IDOR — same
// vulnerability class, different object surface). Notes can be read by any
// authed user regardless of owner. Write paths (PATCH, DELETE) check
// ownership; read does not. Enumerating /api/notes/1, /api/notes/2, ...
// reveals every note in the database.
router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'not_found' });

  const out = { ...note };
  if (isCrossUserNoteAccess(req.user, note)) {
    out.flag_e08 = 'FLAG{bola-on-notes-read-everything}';
  }
  res.json(out);
});

function isCrossUserNoteAccess(viewer, note) {
  if (!viewer || !note) return false;
  if (viewer.id === note.owner_id) return false;             // owner
  if (viewer.is_admin || viewer.role === 'admin') return false; // admin
  return true;
}
module.exports.isCrossUserNoteAccess = isCrossUserNoteAccess;

// ---- PATCH /api/notes/:id ----
router.patch('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, content, category, tags } = req.body || {};
  const note = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'not_found' });
  if (note.owner_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  getDb().prepare(`
    UPDATE notes SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      category = COALESCE(?, category),
      tags = COALESCE(?, tags),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title || null, content || null, category || null, tags || null, id);
  res.json({ ok: true });
});

// ---- DELETE /api/notes/:id ----
router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'not_found' });
  if (note.owner_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
