'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const serveIndex = require('serve-index');

const { getDb } = require('./db/connection');
const corsMiddleware = require('./middleware/cors');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Eagerly initialize the database (creates schema + seeds on first run).
getDb();

const app = express();

// ---- CH-T03 / CH-T04: deliberately vulnerable header config ----
// X-Powered-By is set explicitly (not just left default) to be unambiguous.
// helmet() is intentionally NOT registered.
app.disable('etag');
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Chalanee/1.0.0-beta');
  res.setHeader('Server', 'Express');
  next();
});

// ---- CH-M06: vulnerable CORS ----
app.use(corsMiddleware);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- views (EJS) ----
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ---- CH-T05: directory listing ----
const publicDir = path.join(__dirname, 'public');
app.use('/uploads', express.static(path.join(publicDir, 'uploads')),
  serveIndex(path.join(publicDir, 'uploads'), { icons: true }));
app.use('/backup', express.static(path.join(publicDir, 'backup')),
  serveIndex(path.join(publicDir, 'backup'), { icons: true }));

// ---- CH-T02: robots.txt + other static files ----
app.use(express.static(publicDir));

// ---- request logger ----
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ---- routes ----
app.use('/', require('./routes/pages'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/internal', require('./routes/internal'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/_canary', require('./routes/canary'));
app.use('/api/v1', require('./routes/v1/index'));
app.use('/search', require('./routes/search'));
app.use('/redirect', require('./routes/redirect'));
app.use('/upload', require('./routes/uploads'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl });
});

// Error handler — leaks stack (A10:2025 mishandling)
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: err.message,
    stack: err.stack,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chalanee ready at http://localhost:${PORT}`);
});
