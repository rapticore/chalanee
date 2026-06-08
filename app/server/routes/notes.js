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

// ---- GET /api/notes/export ----
// CH-M09: XSSI (cross-site script inclusion). Legacy export endpoint that
// predates the `{ notes: [...] }` envelope used by GET /api/notes — it returns
// the caller's notes as a *top-level JSON array* under application/json with no
// X-Content-Type-Options: nosniff (helmet is intentionally off, see CH-T04).
// An attacker page can `<script src="http://victim/api/notes/export">` and,
// under content-sniffing / Array-constructor-override, read the victim's notes
// cross-origin (the cookie rides along on the simple GET).
// Production fix: wrap the rows in an object, set `nosniff`, and require a
// non-simple request (custom header / CORS preflight) so a <script> include
// can't reach it. Registered before `/:id` so `export` isn't swallowed as an id.
router.get('/export', requireAuth, (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, title, content, category, tags FROM notes WHERE owner_id = ? ORDER BY id')
    .all(req.user.id);
  const out = rows.map((r) => ({ ...r }));
  // The sensitive payload that leaks cross-origin is the flag.
  out.push({ id: 0, title: 'archive', content: 'FLAG{xssi-array-leaks-cross-origin}', category: 'system', tags: null });
  res.json(out); // naked top-level JSON array — first non-ws char is '['
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
