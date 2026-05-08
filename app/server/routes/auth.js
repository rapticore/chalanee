'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getDb } = require('../db/connection');
const { signToken } = require('../middleware/auth');

const router = express.Router();

const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10);

const COMMON_PASSWORDS = new Set([
  '1234', '12345', '123456', '1234567', '12345678', 'password', 'admin',
  'qwerty', 'letmein', 'welcome', '111111', 'abc123', 'iloveyou', 'monkey',
]);

// CH-E06 detection on the login path: track which 401 reasons each client
// has observed. The vulnerability *is* the differential — `User not found`
// vs `Invalid password` — so once a single client has seen both, they have
// proven the enumeration oracle. Map is process-local; restarts reset it.
const _enumerationSeen = new Map(); // clientKey -> Set<'user_not_found'|'invalid_password'>
function recordLoginError(req, kind) {
  const key = (req.ip || 'unknown') + '|' + (req.headers['user-agent'] || '');
  if (!_enumerationSeen.has(key)) _enumerationSeen.set(key, new Set());
  const seen = _enumerationSeen.get(key);
  seen.add(kind);
  // Cap the Map so a long-running container does not grow it unboundedly.
  if (_enumerationSeen.size > 1000) {
    const firstKey = _enumerationSeen.keys().next().value;
    _enumerationSeen.delete(firstKey);
  }
  return seen.has('user_not_found') && seen.has('invalid_password');
}

// CH-M08 helper: keep a single session token per visitor cookie value.
// We do NOT regenerate on login; we just upgrade the row to attach user_id.
function upsertSession(db, token, userId) {
  const existing = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (existing) {
    db.prepare('UPDATE sessions SET user_id = ?, upgraded_at = CURRENT_TIMESTAMP WHERE token = ?')
      .run(userId, token);
  } else {
    db.prepare('INSERT INTO sessions (token, user_id, upgraded_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(token, userId);
  }
}

// ---- POST /api/auth/register ----
// CH-M03: mass assignment — req.body is spread without filtering, so role / is_admin pass through.
// CH-E07: weak password policy — accepts >=4 chars and common passwords.
router.post('/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 4) return res.status(400).json({ error: 'password too short (min 4)' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'email already registered' });

  const password_hash = bcrypt.hashSync(password, 4);

  // VULNERABLE: spread req.body so any field a client sends becomes a column.
  const row = {
    name: null, bio: null, role: 'user', is_admin: 0, mfa_secret: null,
    internal_notes: null, ssn: null, preferences: '{}', email_template: null,
    ...req.body,
    email,
    password_hash,
    created_via: req.body && (req.body.role === 'admin' || req.body.is_admin || req.body.isAdmin)
      ? 'mass_assignment' : 'normal',
  };
  // Coerce booleans that mass-assignment clients commonly send
  if (req.body.isAdmin === true || row.role === 'admin') row.is_admin = 1;

  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, bio, role, is_admin,
                       mfa_secret, internal_notes, ssn, preferences,
                       email_template, created_via)
    VALUES (@email, @password_hash, @name, @bio, @role, @is_admin,
            @mfa_secret, @internal_notes, @ssn, @preferences,
            @email_template, @created_via)
  `).run(row);

  const body = { id: result.lastInsertRowid, email, role: row.role };

  // CH-E07: leak flag if a top-10 common password was accepted
  if (COMMON_PASSWORDS.has(password)) {
    body.notice = 'Password accepted. FLAG{password-policy-policy-failure}';
  }

  res.json(body);
});

// ---- POST /api/auth/login ----
// CH-E02: SQL injection — email is concatenated into the query (no param binding).
// CH-E06: username enumeration — distinct messages for unknown vs wrong password.
// CH-E04: cookie missing httpOnly/secure/sameSite.
// CH-T01: default credential pair is bcrypted in seed data.
// CH-M08: session token reused (not regenerated) on login.
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const db = getDb();
  let users;
  try {
    // VULNERABLE: string concatenation
    const sql = `SELECT * FROM users WHERE email = '${email}'`;
    users = db.prepare(sql).all();
  } catch (e) {
    return res.status(500).json({ error: 'SQLITE_ERROR', detail: e.message });
  }

  // CH-E06: leak whether the email exists. We track which error variants this
  // client has already seen, and once they have observed both, we credit the
  // enumeration finding directly in the response.
  if (users.length === 0) {
    const enumProven = recordLoginError(req, 'user_not_found');
    const out = { error: 'User not found' };
    if (enumProven) {
      out.flag_e06 = 'FLAG{enumerated-into-existence}';
      out.note = 'Username enumeration confirmed via login differential — you have observed both `User not found` and `Invalid password` responses, which together expose which emails are registered.';
    }
    return res.status(401).json(out);
  }

  // SQLi tautology detection: more than one user matched — that means OR 1=1 worked.
  const sqliBypass = users.length > 1;
  const user = users[0];
  const passwordOk = bcrypt.compareSync(password, user.password_hash);

  if (!passwordOk && !sqliBypass) {
    // CH-E06: distinct error reveals email exists
    const enumProven = recordLoginError(req, 'invalid_password');
    const out = { error: 'Invalid password' };
    if (enumProven) {
      out.flag_e06 = 'FLAG{enumerated-into-existence}';
      out.note = 'Username enumeration confirmed via login differential — you have observed both `User not found` and `Invalid password` responses, which together expose which emails are registered.';
    }
    return res.status(401).json(out);
  }

  // Track whether the client arrived with a session cookie (for CH-M08 detection).
  const preExistingSession = !!(req.cookies && req.cookies.session);

  // Issue a JWT used both as the API bearer and as the cookie value, so the
  // same verifier middleware works for either transport.
  const jwt_token = signToken({ sub: user.id, email: user.email, role: user.role });
  upsertSession(db, jwt_token, user.id);

  // CH-E04: cookie set without httpOnly/secure/sameSite
  res.cookie('session', jwt_token, {});

  const out = {
    ok: true,
    token: jwt_token,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  };

  // CH-T01: explicit flag for default credentials
  if (email === 'admin@chalanee.com' && password === 'admin123') {
    out.flag_t01 = 'FLAG{default-creds-still-here}';
  }

  // CH-E02: flag when SQLi bypass detected
  if (sqliBypass) {
    out.flag_e02 = 'FLAG{sqli-still-works-in-2026}';
    out.notice = 'multiple users matched the email predicate';
  }

  // CH-E04: flag in response body for evidence-based capture
  out.cookie_advice = 'cookie set without HttpOnly; FLAG{httponly-was-optional-apparently}';

  // CH-M03: flag if the *current login user* was created via mass assignment
  if (user.created_via === 'mass_assignment') {
    out.flag_m03 = 'FLAG{mass-assigned-to-admin}';
  }

  // CH-M08: pre-login cookie was carried through the login boundary.
  if (preExistingSession) {
    out.flag_m08 = 'FLAG{session-stayed-fixed}';
  }

  res.json(out);
});

// ---- POST /api/auth/forgot-password ----
// CH-E06: also leaks via the response message.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Send a fake reset email to MailHog — best-effort, do not fail the request.
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: false,
    });
    const resetToken = crypto.randomBytes(16).toString('hex');
    await transporter.sendMail({
      from: 'noreply@chalanee.local',
      to: email,
      subject: 'Chalanee — password reset',
      text: `Reset your password: http://localhost:3000/reset?token=${resetToken}`,
    });
  } catch (_) { /* mailhog might not be up; ignore */ }

  res.json({
    ok: true,
    message: 'Reset email sent. (User exists.)',
    flag_e06: 'FLAG{enumerated-into-existence}',
  });
});

// ---- POST /api/auth/logout ----
router.post('/logout', (req, res) => {
  const sessionToken = req.cookies && req.cookies.session;
  if (sessionToken) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(sessionToken);
  }
  res.clearCookie('session');
  res.json({ ok: true });
});

module.exports = router;
