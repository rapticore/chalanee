'use strict';

// CH-M06: CORS reflection with credentials.
// Reflects any Origin header AND sets Allow-Credentials: true.
// Production fix: use an exact-match allowlist.

module.exports = function corsMiddleware(req, res, next) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
};
