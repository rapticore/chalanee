'use strict';

const express = require('express');
const router = express.Router();

// ---- GET /redirect?url= ----
// CH-M07: open redirect. No allowlist; any URL is followed.
router.get('/', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  // Detect off-host redirect to surface flag (in body, before redirecting)
  let isExternal = false;
  try {
    const u = new URL(target, 'http://localhost:3000');
    isExternal = !['localhost', '127.0.0.1', ''].includes(u.hostname);
  } catch (_) {
    isExternal = true;
  }

  if (isExternal) {
    return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Redirecting… · Chalanee</title>
  <meta http-equiv="refresh" content="3;url=${target}">
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <main class="ch-main" style="max-width: 560px;">
    <div class="card" style="text-align:center; padding: 36px;">
      <div style="font-size:32px; margin-bottom:12px;">↗</div>
      <h1 style="margin-bottom: 6px;">Heading off-site</h1>
      <p class="muted">You're being redirected to:</p>
      <p class="mono" style="word-break: break-all; padding: 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;">${target}</p>
      <p>FLAG{open-redirect-easy-phish}</p>
      <p class="dim" style="font-size:12.5px;">Auto-redirect in 3 seconds. <a href="${target}">Go now →</a></p>
    </div>
  </main>
</body>
</html>`);
  }
  res.redirect(target);
});

module.exports = router;
