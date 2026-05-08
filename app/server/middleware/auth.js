'use strict';

const jwt = require('jsonwebtoken');
const { getDb } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'chalanee-not-actually-secret-shh';

// CH-M05: classic alg-confusion. The bearer-token path manually trusts
// alg:'none' tokens. Production fix: verify only expected algorithms.

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });
}

function getBearerToken(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return null;
}

function getSessionToken(req) {
  return req.cookies && typeof req.cookies.session === 'string'
    ? req.cookies.session
    : null;
}

function parseJwtHeader(token) {
  try {
    const headerB64 = token.split('.')[0];
    return JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function attachUser(req, user, payload, alg, source) {
  req.user = user;
  req.tokenPayload = payload;
  req.tokenAlg = alg;
  req.authSource = source;
}

function verifyBearerToken(token) {
  const header = parseJwtHeader(token);
  if (!header) return null;

  // VULNERABLE: if the token claims alg:'none', trust the payload without
  // verifying any signature.
  try {
    if (header.alg === 'none') {
      const payloadB64 = token.split('.')[1];
      return {
        payload: JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')),
        alg: header.alg,
      };
    }
    return { payload: jwt.verify(token, JWT_SECRET), alg: header.alg };
  } catch (_) {
    return null;
  }
}

function authenticateBearer(req) {
  const token = getBearerToken(req);
  if (!token) return { present: false };

  const verified = verifyBearerToken(token);
  if (!verified || !verified.payload || !verified.payload.sub) {
    return { present: true, ok: false, error: 'invalid_token' };
  }

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(verified.payload.sub);
  if (!user) return { present: true, ok: false, error: 'user_not_found' };

  attachUser(req, user, verified.payload, verified.alg, 'bearer');
  return { present: true, ok: true };
}

function authenticateSession(req) {
  const token = getSessionToken(req);
  if (!token) return { present: false };

  const row = getDb().prepare('SELECT * FROM sessions WHERE token = ? AND user_id IS NOT NULL').get(token);
  if (!row) return { present: true, ok: false, error: 'invalid_session' };

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user) return { present: true, ok: false, error: 'user_not_found' };

  attachUser(req, user, { sub: user.id, email: user.email, role: user.role }, null, 'session');
  req.sessionToken = token;
  return { present: true, ok: true };
}

function requireAuth(req, res, next) {
  const bearer = authenticateBearer(req);
  if (bearer.ok) return next();
  if (bearer.present) return res.status(401).json({ error: bearer.error });

  const session = authenticateSession(req);
  if (session.ok) return next();
  if (session.present) return res.status(401).json({ error: session.error });

  return res.status(401).json({ error: 'unauthenticated' });
}

// CH-M02 deliberately omits requireAdmin from the admin router.
// We export it for places where we DO want it (none, currently).
function requireAdmin(req, res, next) {
  if (!req.user || (!req.user.is_admin && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

// Optional auth: attaches req.user if a valid bearer token or session cookie is
// present, but never fails the request.
function optionalAuth(req, res, next) {
  const bearer = authenticateBearer(req);
  if (!bearer.ok) authenticateSession(req);
  next();
}

module.exports = {
  signToken,
  requireAuth,
  requireAdmin,
  optionalAuth,
  JWT_SECRET,
};
