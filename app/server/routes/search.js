'use strict';

const express = require('express');
const router = express.Router();

// ---- GET /search?q= ----
// CH-E01: reflected XSS. Query is concatenated into HTML without escaping.
router.get('/', (req, res) => {
  const q = req.query.q || '';
  // VULNERABLE: raw concatenation of q into HTML.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Search · Chalanee</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header class="ch-header">
    <div class="ch-header-inner">
      <a href="/" class="ch-logo" aria-label="Chalanee home">
        <span class="ch-logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </span>
        <span>Chalanee</span>
        <span class="ch-logo-tag">vault</span>
      </a>
      <nav class="ch-nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/search?q=">Search</a>
        <a href="/login" class="cta">Log in</a>
      </nav>
    </div>
  </header>
  <main class="ch-main">
    <div class="ch-page-head">
      <h1>Search</h1>
      <p class="subtle">Search across your notes, categories, and shared content.</p>
    </div>
    <div class="card">
      <form method="GET" action="/search">
        <label class="field">
          <span>Query</span>
          <input type="search" name="q" placeholder="What are you looking for?" value="${q}" autofocus>
        </label>
        <button type="submit">Search</button>
      </form>
    </div>
    <div class="card">
      <h2>Results for ${q}</h2>
      <p class="muted">No notes matched.</p>
    </div>
    <!-- FLAG{search-reflects-everything} -->
  </main>
  <footer class="ch-footer">
    <p><strong>Chalanee 1.0.0-beta</strong> · search</p>
  </footer>
</body>
</html>`);
});

module.exports = router;
