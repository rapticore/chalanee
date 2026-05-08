# Chalanee — Product Requirements Document

| | |
|---|---|
| Document | Chalanee PRD |
| Version | 2.0 (markdown port of v1) |
| Status | Draft for engineering review |
| Audience | Engineers building the assessment platform; instructors reviewing scope |
| Owner | Course development team |
| Companion | `docs/Chalanee_PRD_v2.docx` (Word render of this same document) |

> **Confidential — Instructor and course-development use only. Do not distribute to students.**

Chalanee is a deliberately vulnerable web application designed as the final capstone assessment platform for the *Web Application Penetration Testing with AI-Assisted Security Testing* course. It contains 30 calibrated vulnerabilities across 5 difficulty tiers, mapped to OWASP Top 10:2025, OWASP API Security Top 10, and OWASP WSTG v4.2.

**At a glance:** 32 vulnerabilities · 5 difficulty tiers · 93 raw points · 4.5-hour assessment · Docker single-command deployment · self-service flag scoring · multi-user testing.

> **Catalog history.** v1 of this PRD shipped with 30 vulns / 87 points. During build, two findings were split out from existing root causes to match how a real penetration-test report itemizes findings:
> - **CH-E08** — BOLA on notes (separated from CH-E03 user-profile IDOR — same vuln class, different object surface)
> - **CH-MH07** — unauthenticated internal admin user list (separated from CH-H03 — same trust flaw, distinct read-only impact)
>
> Totals updated accordingly. See [§3.1](#31-difficulty-tier-distribution) and `BUILD_NOTES.md`.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Application Design](#2-application-design)
3. [Vulnerability Catalog](#3-vulnerability-catalog)
4. [Assessment Design](#4-assessment-design)
5. [Technical Architecture](#5-technical-architecture)
6. [Course Alignment](#6-course-alignment)
7. [Development Roadmap](#7-development-roadmap)
- [Appendix A — Sample Student Briefing](#appendix-a--sample-student-briefing)
- [Appendix B — Sample Flag Submission Flow](#appendix-b--sample-flag-submission-flow)
- [Appendix C — Comparison to Existing Tools](#appendix-c--comparison-to-existing-tools)
- [Appendix D — Glossary](#appendix-d--glossary)

---

## 1. Executive Summary

### 1.1 Product Overview

Chalanee is a fictional digital safety-deposit-box / personal vault application — think 1Password meets a basic e-commerce admin panel. Students hunt vulnerabilities across:

- **Authentication & session handling** (login, register, JWT, password reset, optional MFA)
- **Access control** with three roles (`user`, `premium`, `admin`)
- **Notes** (CRUD + sharing) — the core data primitive for IDOR/BOLA testing
- **Orders & coupons** — business-logic surface
- **Webhooks** — outbound HTTP, the SSRF surface
- **File uploads** (avatars) — upload/parsing surface
- **Admin panel** — privilege-escalation surface

### 1.2 Why a Custom App (vs Juice Shop)

Juice Shop is used for training throughout the course. The capstone tests application of methodology to an *unfamiliar* application — the actual skill required in real penetration tests. A custom app provides:

- **Novel attack surface.** Students cannot rely on memorized Juice Shop solutions.
- **Realistic API contracts.** Versioned REST endpoints with proper auth and JSON schemas.
- **Multi-user data.** IDOR/BOLA require multiple test accounts to exploit; eight are pre-seeded.
- **Calibrated difficulty curve.** Trivial findings provide early wins; hard findings require chaining.
- **Automated scoring** via a built-in flag-submission score board.
- **Course alignment.** Every vulnerability maps to a specific class.

### 1.3 Key Numbers

| Metric | Value |
|---|---|
| Total vulnerabilities | 32 across 5 tiers |
| Total raw points | 93 |
| Passing raw flag score | 56 (≈ 60%) — must also pass report rubric |
| Distinguished raw flag score | 74 (≈ 80%) |
| Mastery raw flag score | 84 (≈ 90%) |
| Assessment duration | 4.5 hours (270 min, see [§4.1](#41-assessment-timeline)) |
| Class size per Docker host | up to 30 students |
| Setup time per student | < 5 min from `git clone` to running |
| Final grade model | 50% flag capture + 50% report (see [§4.5](#45-scoring-model)) |

### 1.4 Core User Flow

1. Instructor distributes the GitHub repo URL and assessment briefing ([Appendix A](#appendix-a--sample-student-briefing)).
2. Student clones the repo: `git clone https://github.com/<course>/chalanee.git`.
3. Student runs `docker-compose up --build`.
4. Student visits the app at `http://localhost:3000` and the score board at `http://localhost:3001`.
5. Student registers their *assessment ID* (issued by instructor) on the score board.
6. Student hunts vulns, captures `FLAG{...}` strings, submits each to the score board for instant scoring.
7. Student documents each finding in a professional report (template in repo).
8. After 4 hours of testing, student spends 30 min finalizing the report.
9. Student submits: (a) score board screenshot, (b) report, (c) repo of any custom tooling.

---

## 2. Application Design

### 2.1 Concept

Chalanee is a personal digital vault. Users can:

- Store encrypted notes (text snippets, passwords, secrets)
- Organize notes into categories with tags
- Share notes with other users (view-only or edit access)
- Configure account preferences and 2FA
- Configure webhooks to receive note-change notifications
- Order *Vault Plans* (Free / Premium / Enterprise) via a simulated e-commerce flow
- Redeem promotional coupons for plan discounts
- Upload an avatar image
- View order history

Admins manage users, view all orders, issue refunds, mint coupons, and view aggregate metrics.

### 2.2 Functional Requirements

#### 2.2.1 User Management

- **FR-USER-01** Registration with email + password.
- **FR-USER-02** Login returns a JWT bearer token (and a session cookie, see [§5.3](#53-database-schema)).
- **FR-USER-03** Profile update (name, bio, avatar).
- **FR-USER-04** Password reset via email (delivered to MailHog at `localhost:1080`).
- **FR-USER-05** Optional 2FA (TOTP) — present so students can test bypass scenarios.
- **FR-USER-06** Three roles: `user`, `premium`, `admin`.
- **FR-USER-07** Pre-seeded accounts: 5 regular, 2 premium, 1 admin (see [§4.3](#43-pre-seeded-test-data)).

#### 2.2.2 Notes (Core Feature)

- **FR-NOTE-01** Full CRUD on notes.
- **FR-NOTE-02** Note fields: `id`, `title`, `content`, `category`, `tags`, `created_at`, `updated_at`, `owner_id`.
- **FR-NOTE-03** Note sharing with view-only or edit access (`note_shares` table).
- **FR-NOTE-04** Filter by category and tag.
- **FR-NOTE-05** Markdown rendering on display.

#### 2.2.3 Orders & Coupons

- **FR-ORDER-01** Plan upgrades: Free, Premium ($9.99/mo), Enterprise ($49.99/mo).
- **FR-ORDER-02** Order creates a pending invoice. Payment is *simulated* — no real processor.
- **FR-ORDER-03** Coupon codes apply percentage or fixed-amount discounts.
- **FR-ORDER-04** Pre-seeded coupons: `WELCOME10` (10% off, single-use per user), `BLACKFRIDAY` (25% off, *expired*), `VIP100` (100% off, admin-only).
- **FR-ORDER-05** Per-user order history.

#### 2.2.4 Admin Panel

- **FR-ADMIN-01** List all users.
- **FR-ADMIN-02** Delete any user.
- **FR-ADMIN-03** View all orders; refund any order.
- **FR-ADMIN-04** Mint custom coupon codes.
- **FR-ADMIN-05** Aggregate metrics dashboard (active users, MRR, top categories).

#### 2.2.5 Score Board (Built-in)

- **FR-SCORE-01** Separate web service at `http://localhost:3001`.
- **FR-SCORE-02** Submit `{ assessment_id, flag }` for validation.
- **FR-SCORE-03** Server validates against the canonical flag map.
- **FR-SCORE-04** Per-student dashboard: discovered vulns, points, capture timestamps, leaderboard rank.
- **FR-SCORE-05** Instructor view (token-gated): real-time progress for all students.
- **FR-SCORE-06** Discovery does not leak between students — each student sees only their own progress.

### 2.3 Technical Stack

All versions are **pinned**. Several vulnerabilities depend on specific package behavior or deliberately vulnerable glue code — most importantly the JWT middleware's manual `alg:none` trust branch for CH-M05, and `node-serialize@0.0.4` for the deserialization chain.

| Component | Technology | Pinned Version | Rationale |
|---|---|---|---|
| Backend runtime | Node.js | 20.11.x LTS | Same family as Juice Shop; LTS support |
| Web framework | Express | 4.18.2 | Familiar; default behavior leaves `X-Powered-By` and other headers exposed |
| Frontend | React + Vite | 18.2.0 / 5.x | Modern SPA; allows DOM-based vulns |
| Database | better-sqlite3 | 11.x | File-backed; no external service; easy seed/reset |
| Auth tokens | jsonwebtoken | 9.0.2 | **Load-bearing for CH-M05** |
| Cookies | cookie-parser | 1.4.x | Cookie-based session for CH-E04 / CH-M08 |
| Template engine | EJS | 3.1.x | Server-side rendering; targets CH-H01 (SSTI) |
| File uploads | multer | 1.4.x | Multipart parsing; default permissive config |
| Serialization | node-serialize | 0.0.4 | **Intentionally vulnerable** — CH-H04 |
| HTTP client (webhooks) | axios | 1.6.x | Default follows redirects; no IP allowlist — CH-MH05 |
| Containerization | Docker + Compose | 24+ | Single-command deploy |
| Mail capture | MailHog | 1.0.1 | Testbed for password-reset flow |
| Score board | Express (separate svc) | 4.18.2 | Decoupled scoring authority |

### 2.4 Architecture

Three Docker Compose services on a shared bridge network:

```yaml
# docker-compose.yml (sketch — full file in repo)
services:
  chalanee-app:
    build: ./app
    ports: ["3000:3000"]
    environment:
      - DB_PATH=/data/chalanee.db
      - SCOREBOARD_URL=http://chalanee-scoreboard:3001
      - SMTP_HOST=chalanee-mailcatch
    volumes:
      - app-data:/data

  chalanee-scoreboard:
    build: ./scoreboard
    ports: ["3001:3001"]
    environment:
      - INSTRUCTOR_TOKEN=${INSTRUCTOR_TOKEN:-instructor-default}
    volumes:
      - scoreboard-data:/data

  chalanee-mailcatch:
    image: mailhog/mailhog:v1.0.1
    ports:
      - "1025:1025"   # SMTP
      - "1080:1080"   # web UI

volumes:
  app-data:
  scoreboard-data:
```

**Host requirements**

- Docker Engine 24+ (Compose v2)
- ~2 GB free RAM, ~1 GB free disk
- Ports 3000, 3001, 1080, 1025 free on host

---

## 3. Vulnerability Catalog

### 3.1 Difficulty Tier Distribution

| Tier | Count | Pts each | Tier total | Expected time per vuln | Tag |
|---|---|---|---|---|---|
| Trivial | 5 | 1 | 5 | 2–5 min | Green |
| Easy | 8 | 2 | 16 | 5–10 min | Blue |
| Medium | 8 | 3 | 24 | 10–20 min | Amber |
| Medium-Hard | 7 | 4 | 28 | 20–40 min | Orange |
| Hard | 4 | 5 | 20 | 40+ min | Red |
| **Total** | **32** | — | **93** | — | — |

**Tier design rationale**

- **Trivial** — first 30 min. Builds confidence; no specialized techniques.
- **Easy** — hour 1–2. Apply Class 2–3 fundamentals (auth, basic injection, IDOR).
- **Medium** — hour 1–3. Methodology required (mass assignment, JWT analysis, CORS exploitability).
- **Medium-Hard** — hour 2–4. Creativity and tool use (race conditions, blind SQLi, SSRF).
- **Hard** — hour 3+. Chaining and advanced exploitation. Optional for passing.

**Why a passing student must reach the medium tier (not just trivial+easy).** Finding *all* 5 trivial + *all* 8 easy + 5 medium yields 5 + 16 + 15 = 36 raw points → `(36 / 93) × 50 ≈ 19.4` flag points. Even with a perfect 50-point report, total is ≈ 69.4 → grade C (Proficient), barely above the 60-point pass line. Skipping the medium tier entirely (5 + 16 = 21 raw → 11.3 flag points) means a perfect report is required *just to pass* — and any rubric loss puts the student under 60. The math forces medium-tier methodology, not just basic vulnerability spotting.

### 3.2 Master Vulnerability Map

All 30 vulnerabilities, with OWASP and WSTG mappings. Detailed specifications follow in [§3.3](#33-detailed-vulnerability-specifications).

| ID | Tier | Pts | Vulnerability | OWASP / API | WSTG |
|---|---|---|---|---|---|
| CH-T01 | Trivial | 1 | Default credentials on admin panel | A07 Auth Failures | WSTG-ATHN-02 |
| CH-T02 | Trivial | 1 | robots.txt information disclosure | A02 Misconfig | WSTG-CONF-04 |
| CH-T03 | Trivial | 1 | Verbose Server header | A02 Misconfig | WSTG-INFO-02 |
| CH-T04 | Trivial | 1 | Missing security headers | A02 Misconfig | WSTG-CONF-07 |
| CH-T05 | Trivial | 1 | Directory listing enabled | A02 Misconfig | WSTG-CONF-04 |
| CH-E01 | Easy | 2 | Reflected XSS in search | A05 Injection | WSTG-INPV-01 |
| CH-E02 | Easy | 2 | SQL injection in login | A05 Injection | WSTG-INPV-05 |
| CH-E03 | Easy | 2 | IDOR on user profile | A01 / API1 BOLA | WSTG-ATHZ-04 |
| CH-E04 | Easy | 2 | Insecure cookie flags | A07 / A02 | WSTG-SESS-02 |
| CH-E05 | Easy | 2 | Sensitive data in JS bundle | A02 Misconfig | WSTG-CLNT-13 |
| CH-E06 | Easy | 2 | Username enumeration | A07 Auth Failures | WSTG-IDNT-04 |
| CH-E07 | Easy | 2 | Weak password policy | A07 Auth Failures | WSTG-ATHN-07 |
| CH-E08 | Easy | 2 | BOLA on notes (cross-user note read) | A01 / API1 BOLA | WSTG-ATHZ-04 |
| CH-M01 | Medium | 3 | Stored XSS in user bio | A05 Injection | WSTG-INPV-02 |
| CH-M02 | Medium | 3 | BFLA: user calls admin endpoint | A01 / API5 BFLA | WSTG-ATHZ-02 |
| CH-M03 | Medium | 3 | Mass assignment on registration | A01 / API6 | WSTG-ATHZ-04 |
| CH-M04 | Medium | 3 | Excessive data exposure | API3 | WSTG-ATHZ-04 |
| CH-M05 | Medium | 3 | JWT `none` algorithm accepted | A07 / API2 | WSTG-SESS-01 |
| CH-M06 | Medium | 3 | CORS reflection with credentials | A05 / Misconfig | WSTG-CLNT-07 |
| CH-M07 | Medium | 3 | Open redirect | A01 | WSTG-CLNT-04 |
| CH-M08 | Medium | 3 | Session fixation | A07 | WSTG-SESS-03 |
| CH-MH01 | Medium-Hard | 4 | Blind SQL injection in notes filter | A05 | WSTG-INPV-05 |
| CH-MH02 | Medium-Hard | 4 | Stored XSS via SVG upload | A05 / API3 | WSTG-INPV-02 |
| CH-MH03 | Medium-Hard | 4 | Race condition in coupon redemption | A06 / API4 | WSTG-BUSL |
| CH-MH04 | Medium-Hard | 4 | Negative quantity in orders | A06 | WSTG-BUSL |
| CH-MH05 | Medium-Hard | 4 | SSRF via webhook configuration | A01 / API7 | WSTG-INPV-19 |
| CH-MH06 | Medium-Hard | 4 | API v1 still accessible without auth | API9 | WSTG-CONF-08 |
| CH-MH07 | Medium-Hard | 4 | Unauthenticated internal admin user list | API9 / A01 | WSTG-ATHN-01 |
| CH-H01 | Hard | 5 | Server-Side Template Injection (SSTI) | A05 | WSTG-INPV |
| CH-H02 | Hard | 5 | Prototype pollution via JSON merge | A08 / A05 | WSTG-INPV |
| CH-H03 | Hard | 5 | Chained: SSRF → internal API → admin takeover | Multiple | Chain |
| CH-H04 | Hard | 5 | Insecure deserialization (RCE) | A08 | WSTG-INPV-11 |

### 3.3 Detailed Vulnerability Specifications

Each spec ends with an **Implementation Note** for the engineer building the bug — the file the bug should live in and the shape of the deliberately-broken code.

---

#### Trivial Tier (5 vulnerabilities, 5 pts)

##### CH-T01 — Default Credentials on Admin Panel  *(Trivial, 1 pt)*

| Field | Value |
|---|---|
| OWASP / API | A07 Authentication Failures |
| WSTG | WSTG-ATHN-02 |
| Location | `POST /api/auth/login` via `/admin` UI |
| Description | Admin panel accepts `admin@chalanee.com` / `admin123` left from initial setup. |
| How to Find | Navigate to `/admin`; try common default credential pairs. |
| Production Remediation | Force password change on first login; remove default accounts before production deploy. |
| Capture Flag | `FLAG{default-creds-still-here}` |
| Implementation Note | Seed `users` row: `email='admin@chalanee.com', password_hash=bcrypt('admin123'), role='admin'`. Place flag-emit logic in `app/server/routes/auth.js` — return the flag in the login response body when the credential pair matches exactly. |

##### CH-T02 — robots.txt Information Disclosure  *(Trivial, 1 pt)*

| Field | Value |
|---|---|
| OWASP / API | A02 Security Misconfiguration |
| WSTG | WSTG-CONF-04 |
| Location | `/robots.txt` |
| Description | `robots.txt` lists `/admin`, `/backup`, `/api/internal`, and `/.git` as `Disallow` entries. |
| How to Find | `GET /robots.txt`; review `Disallow` entries. |
| Production Remediation | Do not use `robots.txt` to hide sensitive paths; rely on proper authentication. |
| Capture Flag | `FLAG{robots-betrayed-the-secrets}` |
| Implementation Note | Static file at `app/server/public/robots.txt`. The flag itself appears as a comment line at the bottom: `# FLAG{robots-betrayed-the-secrets}` so the student must actually fetch and read the file. |

##### CH-T03 — Verbose Server Header  *(Trivial, 1 pt)*

| Field | Value |
|---|---|
| OWASP / API | A02 Security Misconfiguration |
| WSTG | WSTG-INFO-02 |
| Location | All HTTP responses |
| Description | `Server: Express` and `X-Powered-By: Chalanee/1.0.0-beta` reveal stack and version. |
| How to Find | `curl -I` or DevTools Network tab. |
| Production Remediation | `app.disable('x-powered-by')` and use `helmet.hidePoweredBy()`; strip `Server` at the proxy. |
| Capture Flag | N/A (informational — evidence-based finding for the report) |
| Implementation Note | `app/server/server.js`: do *not* call `app.disable('x-powered-by')`; add custom middleware setting `X-Powered-By: Chalanee/1.0.0-beta`. No flag — points are awarded for documenting the finding in the report. |

##### CH-T04 — Missing Security Headers  *(Trivial, 1 pt)*

| Field | Value |
|---|---|
| OWASP / API | A02 Security Misconfiguration |
| WSTG | WSTG-CONF-07 |
| Location | All HTTP responses |
| Description | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy all absent. |
| How to Find | `curl -I` or run securityheaders.com against the target. |
| Production Remediation | Add `helmet()` middleware with full config. |
| Capture Flag | N/A (informational — evidence-based) |
| Implementation Note | Do not register `helmet` in `app/server/server.js`. Same as CH-T03, awarded via report. |

##### CH-T05 — Directory Listing Enabled  *(Trivial, 1 pt)*

| Field | Value |
|---|---|
| OWASP / API | A02 Security Misconfiguration |
| WSTG | WSTG-CONF-04 |
| Location | `/uploads/`, `/backup/` |
| Description | Directory listing enabled, exposing user files and an old database backup `chalanee-2024-12-01.bak`. |
| How to Find | Browse to `/uploads/` or `/backup/` and observe HTML directory index. |
| Production Remediation | Disable autoindex; serve only specific files behind authorization. |
| Capture Flag | `FLAG{indexed-and-exposed}` |
| Implementation Note | Use `serve-index` middleware on `/uploads` and `/backup`. Place a file `app/server/public/backup/INDEX-FLAG.txt` containing the flag. |

---

#### Easy Tier (7 vulnerabilities, 14 pts)

##### CH-E01 — Reflected XSS in Search  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 Injection |
| WSTG | WSTG-INPV-01 |
| Location | `GET /search?q=` |
| Description | Search query reflected unescaped into the results page heading. |
| How to Find | Submit `?q=<script>alert(1)</script>` and observe execution. Canary: `XSSTEST123` reflects unencoded. |
| Production Remediation | HTML-encode the search term before insertion; use template engine auto-escaping. |
| Capture Flag | `FLAG{search-reflects-everything}` |
| Implementation Note | `app/server/routes/search.js`: render with `res.send(\`<h1>Results for ${req.query.q}</h1>...\`)` (string concat, no escape). The flag is *embedded inside the document* — only visible if XSS executes a fetch back to a known endpoint that returns the flag, OR included in the alert payload. Pick one of: (a) flag in source comment of search page (lazy capture), or (b) flag returned by `GET /api/_canary/xss` only if `Origin` matches the search page (forces actual exploit). |

##### CH-E02 — SQL Injection in Login  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 Injection |
| WSTG | WSTG-INPV-05 |
| Location | `POST /api/auth/login` |
| Description | Login endpoint concatenates email into SQL: `SELECT * FROM users WHERE email='${email}' AND password_hash='${hash}'`. Bypass with `admin' OR 1=1--`. |
| How to Find | Submit single quote in email field and observe `SQLITE_ERROR`; then use `OR 1=1--` bypass. |
| Production Remediation | Parameterized queries: `db.prepare('SELECT * FROM users WHERE email = ?').get(email)`. |
| Capture Flag | `FLAG{sqli-still-works-in-2026}` |
| Implementation Note | `app/server/routes/auth.js` `loginHandler`: the email is concatenated; password is bcrypt-compared *after* the row is fetched, so any row found bypasses password check if the comparison short-circuits. Return the flag in the login response *only* when the SQL trace shows a tautology (e.g., row count > 1, indicating no specific user matched). |

##### CH-E03 — IDOR on User Profile  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A01 Access Control / API1 BOLA |
| WSTG | WSTG-ATHZ-04 |
| Location | `GET /api/users/:id` |
| Description | Any authenticated user can fetch any other user's full profile by changing the `id` in the URL. |
| How to Find | Log in as `alice@test.com`, then `GET /api/users/2`, `/api/users/3`, etc. |
| Production Remediation | Ownership check: `if (req.user.id !== requestedId && !req.user.isAdmin) return 403`. |
| Capture Flag | `FLAG{idor-classic-find-the-other-user}` |
| Implementation Note | `app/server/routes/users.js` `getUserById`: no ownership check. Embed the flag as a string field on the `admin@chalanee.com` row, so the student must enumerate to ID 1 (admin) to capture it. |

##### CH-E04 — Insecure Cookie Flags  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A07 Authentication / A02 Misconfig |
| WSTG | WSTG-SESS-02 |
| Location | `Set-Cookie` headers on login |
| Description | Session cookie missing `HttpOnly`, `Secure`, `SameSite`. Vulnerable to XSS theft and CSRF. |
| How to Find | Inspect `Set-Cookie` after login (DevTools → Application → Cookies). |
| Production Remediation | `res.cookie(name, val, { httpOnly: true, secure: true, sameSite: 'strict' })`. |
| Capture Flag | `FLAG{httponly-was-optional-apparently}` |
| Implementation Note | `app/server/routes/auth.js`: set cookie with `res.cookie('session', token, { /* no flags */ })`. The flag appears in a comment in the login response body; alternatively, validation triggers when the score board's verification endpoint receives a *cookie reflection from XSS* — which requires CH-E01 chained. Recommend the simpler comment-in-body approach. |

##### CH-E05 — Sensitive Data in JS Bundle  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A02 Security Misconfiguration |
| WSTG | WSTG-CLNT-13 |
| Location | `/static/js/main.<hash>.js` |
| Description | Client bundle contains hardcoded `STRIPE_TEST_KEY`, `MAPBOX_TOKEN`, and a reference to `/api/internal/admin/users`. |
| How to Find | View source of `main.js`; search for `key`, `token`, `secret`, `admin`, `_internal`. |
| Production Remediation | Move secrets to server-side env vars; never embed API keys in client bundles. |
| Capture Flag | `FLAG{secrets-in-the-bundle}` |
| Implementation Note | `app/client/src/config.ts`: hardcode `const STRIPE_TEST_KEY = 'pk_test_FLAG{secrets-in-the-bundle}_sk_xxx'`. The flag is embedded inside the fake key so discovery requires actually grepping the bundle. |

##### CH-E06 — Username Enumeration  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A07 Authentication Failures |
| WSTG | WSTG-IDNT-04 |
| Location | `POST /api/auth/login`, `POST /api/auth/forgot-password` |
| Description | Login returns `User not found` for invalid email vs `Invalid password` for valid. Forgot-password leaks the same way. |
| How to Find | Submit known and unknown emails; compare error messages and timing. |
| Production Remediation | Generic error: `Invalid email or password`. Equalize timing. |
| Capture Flag | `FLAG{enumerated-into-existence}` |
| Implementation Note | `app/server/routes/auth.js`: branch error messages on existence. Flag is returned by `GET /api/_canary/enumerated?emails=...` when the request body proves at least 5 valid + 5 invalid emails were probed (pattern detection in score board). Simpler alt: include flag in `forgot-password` response body for a known-canary email like `enumerator@chalanee.local`. |

##### CH-E08 — BOLA on Notes  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A01 Access Control / API1 BOLA |
| WSTG | WSTG-ATHZ-04 |
| Location | `GET /api/notes/:id`, `/notes/:id/edit` |
| Description | Notes can be read by any authenticated user regardless of owner. Write paths (`PATCH`, `DELETE`) check ownership; read does not. Enumerating `/api/notes/1`, `/api/notes/2`, … reveals every note in the database. Distinct from CH-E03 (user-profile IDOR) — same vulnerability class, different object surface. |
| How to Find | Login as alice; `GET /api/notes/30` (a note owned by another user); response body returned, plus `flag_e08`. Browser path: `/notes/30/edit` renders the form with an alert banner. |
| Production Remediation | Add ownership check to `GET /api/notes/:id`: `if (note.owner_id !== req.user.id && !req.user.is_admin) return 403`. Same fix shape as CH-E03. |
| Capture Flag | `FLAG{bola-on-notes-read-everything}` |
| Implementation Note | `app/server/routes/notes.js` `getNoteById`: emits flag when caller is non-admin and not the owner. The page route `/notes/:id/edit` in `pages.js` performs the same check and passes `bolaFlag` to the EJS template, which renders an explanatory amber banner. |

##### CH-E07 — Weak Password Policy  *(Easy, 2 pts)*

| Field | Value |
|---|---|
| OWASP / API | A07 Authentication Failures |
| WSTG | WSTG-ATHN-07 |
| Location | `POST /api/auth/register` |
| Description | Registration accepts passwords as short as 4 chars and common values like `1234`, `password`, `admin`. |
| How to Find | Register accounts with `1234`, `password`, `admin`, single-character passwords. |
| Production Remediation | Enforce 12+ chars; check against a common-password list (e.g., `zxcvbn`). |
| Capture Flag | `FLAG{password-policy-policy-failure}` |
| Implementation Note | `app/server/routes/auth.js` `registerHandler`: only validate `length >= 4`. Return the flag in the registration response when the chosen password is in the top-10-common list (`password`, `123456`, etc.). |

---

#### Medium Tier (8 vulnerabilities, 24 pts)

##### CH-M01 — Stored XSS in User Bio  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 Injection |
| WSTG | WSTG-INPV-02 |
| Location | `PATCH /api/users/:id/bio`, rendered at `/users/:id` |
| Description | Bio stored unescaped and rendered in HTML when other users view the profile. |
| How to Find | Set bio to `<script>fetch('/log?c='+document.cookie)</script>`; have another user view the profile. |
| Production Remediation | Sanitize on input with DOMPurify; store raw text and encode on output. |
| Capture Flag | `FLAG{stored-xss-in-the-bio}` |
| Implementation Note | `app/client/src/pages/UserProfile.tsx`: render bio with `dangerouslySetInnerHTML`. Server stores raw. Flag is returned by `GET /api/_canary/stored-xss` only when called from a logged-in user *different* from the bio author (proves cross-user execution). |

##### CH-M02 — BFLA: User Calls Admin Endpoint  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A01 / API5 BFLA |
| WSTG | WSTG-ATHZ-02 |
| Location | `GET /api/admin/users`, `DELETE /api/admin/users/:id` |
| Description | Admin endpoints check authentication but not authorization. A regular user can list and delete any user. |
| How to Find | Authenticated as regular user, send `GET /api/admin/users` — receive full user list. |
| Production Remediation | Role-check middleware on all `/api/admin/*` routes. |
| Capture Flag | `FLAG{bfla-vertical-escalation-complete}` |
| Implementation Note | `app/server/routes/admin.js`: `requireAuth` middleware applied; `requireAdmin` middleware deliberately omitted. Flag is returned in the user-list response only when the caller's JWT role is *not* admin. |

##### CH-M03 — Mass Assignment on Registration  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A01 / API6 |
| WSTG | WSTG-ATHZ-04 |
| Location | `POST /api/auth/register` |
| Description | Registration accepts arbitrary fields including `role` and `isAdmin`. Posting `{ email, password, role: 'admin' }` creates an admin account. |
| How to Find | Add `role: 'admin'` and `isAdmin: true` to registration body; log in to test access. |
| Production Remediation | Explicit destructuring/DTO: `const { email, password } = req.body`. |
| Capture Flag | `FLAG{mass-assigned-to-admin}` |
| Implementation Note | `app/server/routes/auth.js` `registerHandler`: `const user = await db.users.insert({ ...req.body, password_hash })`. The flag is returned in the *first admin login* response for any account created via mass-assignment (track creation method in the row). |

##### CH-M04 — Excessive Data Exposure  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | API3 |
| WSTG | WSTG-ATHZ-04 |
| Location | `GET /api/users/:id` |
| Description | API returns `password_hash`, `mfa_secret`, `internal_notes`, `ssn` not displayed in the UI. |
| How to Find | Compare API response (raw JSON) to UI-displayed fields; identify hidden sensitive fields. |
| Production Remediation | Allowlist serializer: `{ id, name, email, bio, joined }`. |
| Capture Flag | `FLAG{api-said-too-much}` |
| Implementation Note | `app/server/routes/users.js` `getUserById`: `res.json(user)` (entire row). The flag lives in `internal_notes` of the seeded admin user. |

##### CH-M05 — JWT `none` Algorithm Accepted  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A07 / API2 |
| WSTG | WSTG-SESS-01 |
| Location | All authenticated endpoints (`Authorization: Bearer ...`) |
| Description | Server reads the JWT header before verification and deliberately trusts payloads whose header claims `alg:none`. Forge admin token by changing payload and stripping the signature. |
| How to Find | Decode JWT at jwt.io; modify `alg` to `none` and `role` to `admin`; strip signature; resend. |
| Production Remediation | `jwt.verify(token, secret, { algorithms: ['HS256'] })`. |
| Capture Flag | `FLAG{none-algorithm-still-a-thing}` |
| Implementation Note | `app/server/middleware/auth.js`: the bearer-token path branches on the untrusted JWT header and skips signature verification for `alg:none`. The flag is returned by `GET /api/users/me` when the JWT header `alg` is `none` *and* the payload `role` is `admin`. |

##### CH-M06 — CORS Reflection with Credentials  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 / Misconfig |
| WSTG | WSTG-CLNT-07 |
| Location | All `/api/*` responses |
| Description | Server reflects the `Origin` header into `Access-Control-Allow-Origin` *and* sets `Access-Control-Allow-Credentials: true`. Exploitable for cross-origin data theft. |
| How to Find | `curl -H 'Origin: https://evil.com' -I /api/users/me`; check ACAO and ACAC headers. |
| Production Remediation | Exact-match allowlist: `if (ALLOWED.includes(origin)) res.setHeader(...)`. |
| Capture Flag | `FLAG{cors-reflected-and-creds-allowed}` |
| Implementation Note | `app/server/middleware/cors.js`: `res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')` plus `res.setHeader('Access-Control-Allow-Credentials', 'true')`. Flag is returned by `GET /api/_canary/cors` when `Origin` is non-empty and not `http://localhost:3000`. |

##### CH-M07 — Open Redirect  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A01 |
| WSTG | WSTG-CLNT-04 |
| Location | `GET /redirect?url=` |
| Description | Login flow redirects to a user-supplied URL after authentication without validation: `/redirect?url=https://evil.com`. |
| How to Find | Test `/redirect?url=https://evil.com` after login; browser follows. |
| Production Remediation | Validate against an allowlist; prefer relative paths only. |
| Capture Flag | `FLAG{open-redirect-easy-phish}` |
| Implementation Note | `app/server/routes/redirect.js`: `res.redirect(req.query.url)`. Flag is returned in the redirect response body (HTML) before the redirect, *only* when the target host is not the local app. |

##### CH-M08 — Session Fixation  *(Medium, 3 pts)*

| Field | Value |
|---|---|
| OWASP / API | A07 |
| WSTG | WSTG-SESS-03 |
| Location | `POST /api/auth/login` |
| Description | Session token does not change after successful login. An attacker who plants a token can hijack the user's authenticated session. |
| How to Find | Capture pre-login token; complete login; observe token unchanged. Replay original token — still valid. |
| Production Remediation | Regenerate session ID at every privilege boundary. |
| Capture Flag | `FLAG{session-stayed-fixed}` |
| Implementation Note | `app/server/routes/auth.js`: same session ID issued before and after login (single random token per visitor cookie, upgraded in-place to authenticated). Flag is returned by `GET /api/_canary/fixation` when the same `session` cookie value is observed in both pre-auth and post-auth requests. |

---

#### Medium-Hard Tier (6 vulnerabilities, 24 pts)

##### CH-MH01 — Blind SQL Injection in Notes Filter  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 Injection |
| WSTG | WSTG-INPV-05 |
| Location | `GET /api/notes?category=` |
| Description | Notes category filter is concatenated into SQL with no error returned. Boolean-based blind SQLi or time-based via `randomblob()`. |
| How to Find | Submit `category=foo' AND 1=1--` vs `category=foo' AND 1=2--`; compare response length/timing. |
| Production Remediation | Parameterized queries with bound parameters. |
| Capture Flag | `FLAG{blind-but-talkative}` |
| Implementation Note | `app/server/routes/notes.js` `listNotes`: `\`SELECT * FROM notes WHERE owner_id=? AND category='${req.query.category}'\``. Catch all errors silently. The flag is exfiltrated character-by-character via `SUBSTR((SELECT flag FROM _ctf_flags WHERE id=1), N, 1)`; create the helper `_ctf_flags` table seeded with the flag string. |

##### CH-MH02 — Stored XSS via SVG Upload  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 / API3 |
| WSTG | WSTG-INPV-02 |
| Location | `POST /api/users/:id/avatar` |
| Description | Avatar upload accepts SVG. SVGs are served from `/uploads/avatars/` with `Content-Type: image/svg+xml`, but the file is also linkable directly — modern browsers execute embedded `<script>` in SVGs opened as documents. |
| How to Find | Upload SVG containing `<script>alert(1)</script>`; access `/uploads/avatars/<file>.svg` directly in a browser. |
| Production Remediation | Re-encode uploads to PNG/JPEG; serve uploads with `Content-Disposition: attachment` and a strict CSP. |
| Capture Flag | `FLAG{svg-is-the-new-html}` |
| Implementation Note | `app/server/routes/uploads.js`: accept any MIME starting with `image/`; do not strip scripts. Flag is returned by `GET /api/_canary/svg-xss` when called by an authenticated session whose `Referer` is an SVG path under `/uploads/avatars/`. |

##### CH-MH03 — Race Condition in Coupon Redemption  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | A06 / API4 |
| WSTG | WSTG-BUSL |
| Location | `POST /api/coupons/redeem` |
| Description | Coupon redemption reads `used` flag and updates it in separate operations without locking. Two simultaneous requests both succeed. |
| How to Find | Send 5+ simultaneous redemption requests via `curl &` or Burp Intruder; check if multiple succeed. |
| Production Remediation | Atomic SQL: `UPDATE coupons SET used=true, redeemed_by=? WHERE code=? AND used=false RETURNING *` — check rowcount. |
| Capture Flag | `FLAG{race-won-multiple-times}` |
| Implementation Note | `app/server/routes/coupons.js` `redeem`: `SELECT used FROM coupons WHERE code=?`; `if (!used) UPDATE ... SET used=true`. Add a deliberate 100ms `await sleep()` between read and write to make the race trivially exploitable. Flag is returned in the redemption response when the same coupon's `redeemed_by` count exceeds 1. |

##### CH-MH04 — Negative Quantity in Orders  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | A06 Insecure Design |
| WSTG | WSTG-BUSL |
| Location | `POST /api/orders` |
| Description | Order endpoint accepts negative quantities. Negative quantities produce negative subtotals; the user receives a credit. |
| How to Find | Submit `POST /api/orders` with item `quantity: -10`; observe negative total and credit application. |
| Production Remediation | Server-side validation: reject `quantity <= 0`. |
| Capture Flag | `FLAG{negative-quantity-positive-balance}` |
| Implementation Note | `app/server/routes/orders.js` `createOrder`: `total = items.reduce((s, i) => s + i.price * i.quantity, 0)` with no quantity floor. Flag is returned in the order-creation response when the resulting `total < 0`. |

##### CH-MH05 — SSRF via Webhook Configuration  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | A01 / API7 |
| WSTG | WSTG-INPV-19 |
| Location | `POST /api/webhooks` |
| Description | Webhook URL accepts internal addresses including `169.254.169.254` (cloud metadata) and `127.0.0.1` (internal services). Server fetches the URL on creation. |
| How to Find | Set webhook URL to `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:3000/api/admin/users`; observe response. |
| Production Remediation | URL allowlisting; reject RFC1918 + `169.254/16`; HTTPS-only. |
| Capture Flag | `FLAG{ssrf-internal-or-cloud}` |
| Implementation Note | `app/server/routes/webhooks.js` `createWebhook`: `await axios.get(req.body.url)` with no validation. Bind a fake metadata responder on `127.0.0.1:8081` inside the container that returns the flag. Webhook test response surfaces the upstream body to the user. |

##### CH-MH06 — API v1 Still Accessible Without Auth  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | API9 Improper Inventory Mgmt |
| WSTG | WSTG-CONF-08 |
| Location | `GET /api/v1/users`, `/api/v1/orders`, `/api/v1/admin/*` |
| Description | Current `/api/v2/*` requires authentication. Deprecated `/api/v1/users` still exists and returns user data without auth. |
| How to Find | Try `/api/v1/users`, `/api/v1/orders`, `/api/v1/admin/*` without authentication. |
| Production Remediation | Decommission v1 endpoints; if compatibility required, apply same auth middleware as v2. |
| Capture Flag | `FLAG{v1-never-died}` |
| Implementation Note | `app/server/routes/v1/*.js`: separate router mounted before auth middleware. Flag is returned by `GET /api/v1/users/1` (admin user) — embedded in the response. |

---

#### Hard Tier (4 vulnerabilities, 20 pts)

##### CH-MH07 — Unauthenticated Internal Admin User List  *(Medium-Hard, 4 pts)*

| Field | Value |
|---|---|
| OWASP / API | API9 Improper Inventory / A01 Access Control |
| WSTG | WSTG-ATHN-01 (authentication boundary), WSTG-CONF-08 |
| Location | `GET /api/internal/admin/users` |
| Description | "Internal-only" endpoint that authenticates by source IP. The trust allowlist is too broad (it includes the docker bridge gateway) and the docker-compose port mapping exposes the entire `/api/internal/*` surface to the host machine. The endpoint returns the full user list (id, email, role) to any caller. Read-only sibling of CH-H03 (which uses the same trust flaw to write — admin password reset). |
| How to Find | `curl http://localhost:3000/api/internal/admin/users` from your host machine (no auth). Path is hinted at via `/robots.txt` (CH-T02) and the JS bundle (CH-E05). Also reachable via the SSRF chain (CH-MH05). |
| Production Remediation | Internal endpoints should not authenticate by source IP — use service-to-service tokens. Do not port-map services that expose `/internal/*` routes; bind them to a docker-network-only listener. |
| Capture Flag | `FLAG{internal-api-was-public}` |
| Implementation Note | `app/server/routes/internal.js` GET `/admin/users` — flag emitted unconditionally because reaching the route means the IP-trust check was passed by a non-service caller. |

##### CH-H01 — Server-Side Template Injection (SSTI)  *(Hard, 5 pts)*

| Field | Value |
|---|---|
| OWASP / API | A05 Injection |
| WSTG | WSTG-INPV |
| Location | `POST /api/users/:id/email-template` |
| Description | User email signature template is rendered with EJS where user input is *concatenated into the template source*. Test with `<%= 7*7 %>`; escalates to RCE via `<%= process.mainModule.require('child_process').execSync('id') %>`. |
| How to Find | Submit template with `<%= 7*7 %>`; if `49` returns, attempt full process traversal. |
| Production Remediation | Pass user data as variables to a *fixed* template, not concatenated into template source: `ejs.render(fixedTemplate, { name: input })`. |
| Capture Flag | `FLAG{template-engine-pwned}` |
| Implementation Note | `app/server/routes/users.js` `setEmailTemplate`: `const compiled = ejs.compile('Hello, ' + req.body.template)`. Flag is in `/etc/chalanee/.flag` inside the container; SSTI to RCE reads it. Provide an easier path: `<%= process.env.HARD_TIER_FLAG_H01 %>` returns the flag (env var seeded by Compose). |

##### CH-H02 — Prototype Pollution via JSON Merge  *(Hard, 5 pts)*

| Field | Value |
|---|---|
| OWASP / API | A08 / A05 |
| WSTG | WSTG-INPV |
| Location | `PATCH /api/users/:id/preferences` |
| Description | Preferences endpoint deep-merges user JSON with default preferences using a vulnerable merge function. Sending `{"__proto__": {"isAdmin": true}}` pollutes `Object.prototype` globally. |
| How to Find | `PATCH /api/users/me/preferences` with body `{"__proto__": {"isAdmin": true}}`; subsequent requests bypass admin checks. |
| Production Remediation | Use `Object.create(null)` for user-controllable objects; sanitize keys to reject `__proto__`/`constructor`/`prototype`; use `lodash.mergeWith` with proper customizer or `defaultsDeep` + key allowlist. |
| Capture Flag | `FLAG{proto-polluted-and-promoted}` |
| Implementation Note | `app/server/utils/merge.js`: hand-rolled recursive merge that walks `for (const k in src)` without guarding `__proto__`. Flag is returned by `GET /api/users/me` when `({}).isAdmin === true` evaluates true at request time (a global side-effect of pollution). |

##### CH-H03 — Chained Attack: SSRF → Internal API → Admin Takeover  *(Hard, 5 pts)*

| Field | Value |
|---|---|
| OWASP / API | Multiple (A01 + API7) |
| WSTG | Chain |
| Location | Webhook → `/api/internal/admin/reset-password` → admin login |
| Description | Use SSRF (CH-MH05) to call the internal admin password reset endpoint that trusts source IP (any request from `127.0.0.1` is treated as internal). Reset admin password and log in. |
| How to Find | Set webhook URL to `http://127.0.0.1:3000/api/internal/admin/reset-password?email=admin@chalanee.com&new=PWNED`; then log in as admin with `PWNED`. |
| Production Remediation | Internal endpoints must require service-to-service auth tokens, not source-IP trust. |
| Capture Flag | `FLAG{chained-ssrf-to-admin}` |
| Implementation Note | `app/server/routes/internal.js`: middleware `if (req.ip === '127.0.0.1' || req.ip === '::1') next()` else 403. Flag is returned by `GET /api/admin/_postowned` only when caller is logged in as admin via a *recent* password reset (track reset timestamp; window: 5 minutes). |

##### CH-H04 — Insecure Deserialization (RCE)  *(Hard, 5 pts)*

| Field | Value |
|---|---|
| OWASP / API | A08 Integrity Failures |
| WSTG | WSTG-INPV-11 |
| Location | `POST /api/sessions/restore` (cookie value) |
| Description | Application uses `node-serialize@0.0.4` to deserialize a `session_state` cookie. A crafted serialized payload achieves RCE. |
| How to Find | Inspect `session_state` cookie — Base64-encoded serialized data. Craft an IIFE payload with `node-serialize` targeting RCE. |
| Production Remediation | Use signed JWTs or encrypted cookies; never deserialize user-controlled data with unsafe deserializers. |
| Capture Flag | `FLAG{deserialized-and-pwned}` |
| Implementation Note | `app/server/routes/sessions.js` `restore`: `serialize.unserialize(Buffer.from(cookie, 'base64').toString())`. The container has `/etc/chalanee/.flag-h04` containing the flag; an RCE payload reads and exfils. Easier alt path: `process.env.HARD_TIER_FLAG_H04` available to the deserialized code. |

---

## 4. Assessment Design

### 4.1 Assessment Timeline

**Total: 4.5 hours (270 minutes)** — including setup, testing, and report finalization.

> **Note on duration.** Earlier drafts labeled this "3.5 hours". The phase plan below sums to 270 minutes; the documentation has been corrected to match the phase plan, on the rationale that the per-phase breakdown reflects more careful calibration than the headline number.

| Phase | Duration | Activity | Deliverable progress |
|---|---|---|---|
| 1. Setup & Briefing | 15 min | Distribute repo; students clone and run Docker; instructor briefing | Environment running |
| 2. Reconnaissance | 30 min | Map application; register accounts; identify endpoints | API inventory drafted |
| 3. Easy Wins | 45 min | Trivial + early easy findings | 5–10 vulns captured |
| 4. Methodical Testing | 75 min | Medium-tier hunting: IDOR, BFLA, JWT, business logic | Up to 18 vulns captured |
| 5. Advanced Hunting | 45 min | Medium-Hard: race conditions, SSRF, SSTI attempts | Up to 24 vulns captured |
| 6. Hard Targets | 30 min | Hard tier: chained attacks, prototype pollution | Bonus points |
| 7. Report Finalization | 30 min | Polish report; ensure all evidence is captured | Final report complete |
| **Total** | **270 min (4.5 h)** | | Score board screenshot + report submitted |

### 4.2 Pre-Assessment Setup

#### 4.2.1 Student Setup (≤ 5 minutes)

```bash
git clone https://github.com/<course>/chalanee.git
cd chalanee
docker-compose up --build
```

Wait for `Chalanee ready at http://localhost:3000` in the logs. Then:

1. Open `http://localhost:3000` (app) and `http://localhost:3001` (score board).
2. Register your *assessment ID* on the score board (issued by instructor).
3. Verify: register a test user, log in, see the dashboard.

### 4.3 Pre-Seeded Test Data

Eight accounts pre-seeded so IDOR/BOLA can be exercised without the student first creating peer accounts.

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@chalanee.com` | `admin123` | **Not given to students.** Discoverable via CH-T01. |
| Regular | `alice@test.com` | `Password1!` | Has 8 notes, 2 orders |
| Regular | `bob@test.com` | `Password1!` | Has 12 notes, 1 order |
| Regular | `charlie@test.com` | `Password1!` | Has 6 notes, 3 orders |
| Regular | `dave@test.com` | `Password1!` | Has 4 notes, 0 orders |
| Regular | `eve@test.com` | `Password1!` | Has 10 notes, 4 orders, has 2FA enabled |
| Premium | `premium1@test.com` | `Password1!` | Premium plan; has redeemed `WELCOME10` |
| Premium | `premium2@test.com` | `Password1!` | Enterprise plan |

Plus:

- **50+ pre-existing notes** distributed across users (some shared) for IDOR/BOLA testing.
- **20+ pre-existing orders** for access-control testing.
- **3 pre-existing coupons**: `WELCOME10` (10% off, single-use per user), `BLACKFRIDAY` (25% off, *expired*), `VIP100` (100% off, admin-only).

### 4.4 Allowed and Forbidden Tools

**Allowed.** Burp Suite Community/Pro, OWASP ZAP, curl, browser DevTools, jwt.io, hashcat, ffuf, sqlmap (with restraint), text editors, Python/Node scripts, AI tools (with **mandatory disclosure**).

**Forbidden.**

- Sharing flags with other students.
- Decompiling or scraping the score board to extract flags.
- Exploiting other students' instances.
- Modifying the source code of Chalanee to reveal flags.

### 4.5 Scoring Model

Final grade combines automated flag capture (50%) and manual report review (50%).

| Component | Weight | Maximum points | Description |
|---|---|---|---|
| Flag capture | 50% | 87 raw → scaled to 50 | Each captured flag adds tier-points. Score board automated. |
| Report quality | 50% | 50 | Manual review against rubric in [§4.6](#46-report-grading-rubric). |
| **Total** | **100%** | **100** | Final assessment grade |

**Flag capture component.**

- Raw flag score = sum of points for each captured flag (max 87).
- Scaled flag score = `(raw / 87) × 50`.
- Worked example: student captures all 5 trivial + all 7 easy + 5 medium = 5 + 14 + 15 = 34 raw → `(34/87) × 50 = 19.5` flag points. With a perfect 50-point report → 69.5 → grade **C (Proficient)**.
- **Bonus.** First student to capture any Hard-tier flag: +2. First student to capture all 5 trivial flags: +1.

### 4.6 Report Grading Rubric

| Section | Points | Exemplary (full credit) | Insufficient (half/zero) |
|---|---|---|---|
| Executive Summary | 5 | Concise risk overview written for non-technical leadership; highlights top 3 risks | Technical jargon; no risk prioritization |
| Methodology | 5 | Clear scope, tools used, testing approach with phases | Generic copy-paste; no scope statement |
| Finding Quality | 20 | Each finding has: title, OWASP map, CVSS+EPSS+KEV, evidence, business impact, 4-component remediation | Findings without evidence or with generic remediation |
| Evidence Documentation | 8 | Every finding includes request/response, screenshots, reproduction steps | Findings claimed without evidence |
| Severity Accuracy | 5 | CVSS scores justified with vector strings; severity matches actual impact | Default High/Critical without justification |
| AI Use Disclosure | 3 | Complete log of AI interactions with validation | Undisclosed AI use (academic misconduct) |
| Professional Tone | 2 | Could be delivered to a real client | Informal language; typos throughout |
| Chained Attacks | 2 | Identifies and demonstrates at least one finding chain | No chains identified |

### 4.7 Final Grade Calculation

| Total score | Letter | Description |
|---|---|---|
| 90–100 | A | **Mastery.** Found Hard-tier vulnerabilities + professional report quality. |
| 80–89 | B | **Distinguished.** Comprehensive medium-tier coverage + strong report. |
| 70–79 | C | **Proficient.** Solid easy/medium findings + adequate report. |
| 60–69 | D | **Passing.** Minimum competency demonstrated. |
| < 60 | F | **Insufficient.** Re-take or remediation required. |

---

## 5. Technical Architecture

### 5.1 Repository Structure

```
chalanee/
├── docker-compose.yml          # Single-command deployment
├── README.md                   # Student-facing setup guide
├── ASSESSMENT_BRIEFING.md      # Read first — rules and timing
├── REPORT_TEMPLATE.docx        # Professional report template
│
├── app/                        # Main vulnerable application
│   ├── Dockerfile
│   ├── package.json            # All deps version-pinned (see §2.3)
│   ├── server/
│   │   ├── server.js           # Express bootstrap; deliberately omits helmet
│   │   ├── routes/
│   │   │   ├── auth.js         # CH-T01, CH-E02, CH-E04, CH-E06, CH-E07, CH-M03, CH-M08
│   │   │   ├── users.js        # CH-E03, CH-M01, CH-M04, CH-H01
│   │   │   ├── notes.js        # CH-MH01
│   │   │   ├── orders.js       # CH-MH04
│   │   │   ├── coupons.js      # CH-MH03
│   │   │   ├── webhooks.js     # CH-MH05
│   │   │   ├── uploads.js      # CH-MH02
│   │   │   ├── admin.js        # CH-M02
│   │   │   ├── redirect.js     # CH-M07
│   │   │   ├── search.js       # CH-E01
│   │   │   ├── internal.js     # CH-H03 (IP-trust)
│   │   │   ├── sessions.js     # CH-H04 (deserialize)
│   │   │   └── v1/             # CH-MH06 (legacy router, no auth)
│   │   ├── middleware/
│   │   │   ├── auth.js         # CH-M05 (manual JWT none handling)
│   │   │   └── cors.js         # CH-M06
│   │   ├── utils/
│   │   │   └── merge.js        # CH-H02
│   │   ├── db/
│   │   │   ├── schema.sql      # See §5.3
│   │   │   ├── seed.sql        # 8 users, 50+ notes, 20+ orders, 3 coupons
│   │   │   └── connection.js
│   │   └── public/
│   │       ├── robots.txt      # CH-T02 (flag in comment)
│   │       ├── uploads/        # CH-T05 directory listing
│   │       └── backup/         # CH-T05 directory listing
│   └── client/
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── config.ts       # CH-E05 (hardcoded secret)
│           └── pages/
│               └── UserProfile.tsx  # CH-M01 (dangerouslySetInnerHTML)
│
├── scoreboard/                 # Separate scoring service
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js               # Flag validation + leaderboard
│   ├── flags.json              # Encrypted flag database (instructor-only)
│   └── public/                 # Score board UI
│
├── instructor/                 # NOT distributed to students
│   ├── SOLUTIONS.md            # Step-by-step solutions (Phase 8 deliverable)
│   ├── GRADING_RUBRIC.md       # Detailed grading guidance
│   └── flags_master.json       # Cleartext flag map for grading
│
└── .gitignore                  # Excludes instructor/, .db files, /uploads/*.real
```

### 5.2 Score Board API

Three endpoints. All return JSON. Rate-limited per `assessment_id`.

#### 5.2.1 Submit Flag

```http
POST /api/flags/submit
Content-Type: application/json

{ "assessment_id": "student-abc123", "flag": "FLAG{idor-classic-find-the-other-user}" }
```

**Success response** (200):

```json
{
  "valid": true,
  "vuln_id": "CH-E03",
  "tier": "Easy",
  "points_awarded": 2,
  "total_points": 23,
  "max_possible": 87,
  "rank": 4,
  "captured_at": "2026-05-07T15:42:11Z"
}
```

**Invalid flag** (200, valid=false):

```json
{ "valid": false, "reason": "unknown_flag" }
```

**Already captured** (200, valid=false):

```json
{ "valid": false, "reason": "duplicate", "vuln_id": "CH-E03", "originally_captured_at": "2026-05-07T15:30:00Z" }
```

**Unknown assessment_id** (404):

```json
{ "error": "unknown_assessment_id" }
```

**Rate limited** (429):

```json
{ "error": "rate_limited", "retry_after_seconds": 14 }
```

Rate limit: **60 submissions/minute per `assessment_id`**.

#### 5.2.2 Student Dashboard

```http
GET /api/scoreboard/me?assessment_id=student-abc123
```

```json
{
  "assessment_id": "student-abc123",
  "discovered": [
    { "vuln_id": "CH-T01", "captured_at": "2026-05-07T14:18:02Z", "points": 1 },
    { "vuln_id": "CH-E03", "captured_at": "2026-05-07T15:42:11Z", "points": 2 }
  ],
  "total_points": 23,
  "max_possible": 87,
  "rank": 4,
  "time_elapsed": "1:23:45"
}
```

#### 5.2.3 Instructor View

```http
GET /api/scoreboard/instructor
Authorization: Bearer <INSTRUCTOR_TOKEN>
```

Returns leaderboard + per-student progress + last-activity timestamps. 401 without the token.

### 5.3 Database Schema

SQLite, single file at `/data/chalanee.db` inside the container. Reset by deleting the file and restarting the service.

```sql
-- app/server/db/schema.sql

CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  bio             TEXT,                 -- CH-M01: rendered unescaped
  avatar_path     TEXT,                 -- CH-MH02: SVG allowed
  role            TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'premium' | 'admin'
  is_admin        INTEGER NOT NULL DEFAULT 0,    -- CH-M03: mass-assignable
  mfa_secret      TEXT,                 -- CH-M04: leaked via API
  internal_notes  TEXT,                 -- CH-M04: contains seeded flag for admin
  ssn             TEXT,                 -- CH-M04: leaked via API
  preferences     TEXT NOT NULL DEFAULT '{}',  -- JSON; CH-H02 merge target
  email_template  TEXT,                 -- CH-H01 SSTI surface
  created_via     TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'mass_assignment'
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT,                     -- CH-MH01: SQLi sink
  tags        TEXT,                     -- comma-separated
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE note_shares (
  note_id     INTEGER NOT NULL REFERENCES notes(id),
  shared_with INTEGER NOT NULL REFERENCES users(id),
  permission  TEXT NOT NULL,            -- 'view' | 'edit'
  PRIMARY KEY (note_id, shared_with)
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  plan        TEXT NOT NULL,            -- 'free' | 'premium' | 'enterprise'
  quantity    INTEGER NOT NULL,         -- CH-MH04: not floored at 0
  price_cents INTEGER NOT NULL,         -- per unit
  total_cents INTEGER NOT NULL,         -- price * quantity
  coupon_code TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE coupons (
  code            TEXT PRIMARY KEY,
  discount_pct    INTEGER,
  discount_cents  INTEGER,
  used            INTEGER NOT NULL DEFAULT 0,  -- CH-MH03: race target
  redeemed_by     TEXT,                  -- comma-separated user IDs (race lets multiple in)
  expires_at      TEXT,
  admin_only      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE webhooks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  url          TEXT NOT NULL,           -- CH-MH05: SSRF sink
  event        TEXT NOT NULL,           -- 'note.changed' | ...
  last_status  INTEGER,
  last_body    TEXT,                    -- response body surfaced to user
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token        TEXT PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),  -- nullable: pre-auth sessions
  state_blob   TEXT,                    -- CH-H04: node-serialize input
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  upgraded_at  TEXT                     -- CH-M08: not regenerated, only updated
);

-- Internal helper for CH-MH01 blind SQLi exfil target
CREATE TABLE _ctf_flags (
  id    INTEGER PRIMARY KEY,
  flag  TEXT NOT NULL
);
INSERT INTO _ctf_flags (id, flag) VALUES (1, 'FLAG{blind-but-talkative}');
```

### 5.4 Anti-Cheating Measures

1. **Per-student instances.** Each student runs their own Docker stack locally; no shared instance to exfiltrate flags from.
2. **Score-board authority.** The score board is the only authority on flag correctness; flags in the local code are obfuscated or held in env vars / external state the student doesn't trivially `grep` for.
3. **Flag rotation.** Instructor regenerates flags between cohorts via `npm run regenerate-flags` in `instructor/`. The script rewrites both `instructor/flags_master.json` and the embeddings in source.
4. **Submission rate limit.** 60 submissions/min per `assessment_id` prevents brute-force flag guessing.
5. **Code obfuscation.** Flags in source are split across files and partly assembled at runtime; no single `grep` retrieves all of them.
6. **Time-stamped captures.** Score board records exact capture time; suspicious patterns (10 hard-tier flags in 60 seconds; identical capture sequences across two students) are flagged for instructor review.

---

## 6. Course Alignment

### 6.1 Vulnerability-to-Class Mapping

| Class | Topics covered | Chalanee vulnerabilities |
|---|---|---|
| Class 1 | Investigation methodology, RoE, recon | CH-T02 (robots.txt), CH-T03 (server header), CH-E05 (JS bundle analysis) |
| Class 2 | Auth, access control, IDOR, BFLA | CH-E03 (IDOR), CH-E06 (enumeration), CH-M02 (BFLA), CH-M03 (mass assignment) |
| Class 3 | Injection: SQLi, XSS, SSTI | CH-E01 (reflected XSS), CH-E02 (SQLi), CH-M01 (stored XSS), CH-MH01 (blind SQLi), CH-MH02 (SVG XSS), CH-H01 (SSTI) |
| Class 4 | Sessions, misconfig, client-side, CORS | CH-T04 (headers), CH-E04 (cookies), CH-M06 (CORS), CH-M07 (open redirect), CH-M08 (session fixation) |
| Class 5 | API, business logic, supply chain, AI | CH-M04 (data exposure), CH-M05 (JWT), CH-MH03 (race), CH-MH04 (negative qty), CH-MH05 (SSRF), CH-MH06 (versioning), CH-H02 (proto pollution), CH-H03 (chained), CH-H04 (deserialization) |
| Class 6 | Capstone reporting | Report deliverable + presentation prep (rubric in [§4.6](#46-report-grading-rubric)) |

### 6.2 OWASP Top 10:2025 Coverage

| Top 10:2025 | Vulnerabilities covered |
|---|---|
| A01: Broken Access Control | CH-E03, CH-M02, CH-M03, CH-M07 |
| A02: Security Misconfiguration | CH-T02, CH-T03, CH-T04, CH-T05, CH-E05 |
| A03: Software Supply Chain Failures (NEW) | Demonstrated via `package.json` analysis: `node-serialize@0.0.4` is unmaintained and known-vulnerable |
| A04: Cryptographic Failures | CH-M05 (JWT), weak password storage (bcrypt cost 4 — documented as a finding) |
| A05: Injection | CH-E01, CH-E02, CH-M01, CH-M06, CH-MH01, CH-MH02, CH-H01 |
| A06: Insecure Design | CH-MH03, CH-MH04 (business logic) |
| A07: Authentication Failures | CH-T01, CH-E04, CH-E06, CH-E07, CH-M08 |
| A08: Integrity Failures | CH-H02 (prototype pollution), CH-H04 (deserialization) |
| A09: Logging Failures | No security alerts fire — students must report this as a finding |
| A10: Mishandling Exceptional Conditions (NEW) | Verbose error messages on multiple endpoints (`SQLITE_ERROR` from CH-E02, etc.) |

### 6.3 OWASP API Security Top 10 Coverage

| API Top 10 | Vulnerabilities covered |
|---|---|
| API1: BOLA | CH-E03 (and chained variants) |
| API2: Broken Authentication | CH-M05 (JWT none) |
| API3: Broken Object Property Level Auth | CH-M04 (excessive data exposure) |
| API4: Unrestricted Resource Consumption | No rate limiting on most endpoints |
| API5: BFLA | CH-M02 |
| API6: Unrestricted Access to Sensitive Flows | Coupon redemption (CH-MH03) |
| API7: SSRF | CH-MH05 |
| API8: Security Misconfiguration | CH-T03, CH-T04 |
| API9: Improper Inventory Management | CH-MH06 (v1 endpoint) |
| API10: Unsafe Consumption of 3rd-Party APIs | Webhook fetching (chained with CH-MH05) |

---

## 7. Development Roadmap

### 7.1 Phase Plan

| Phase | Duration | Deliverables |
|---|---|---|
| 1. Core App | 2 weeks | Express backend, React frontend, SQLite DB, auth, basic CRUD for notes/orders/users |
| 2. Trivial + Easy Vulns | 1 week | Implement 12 vulns (CH-T01 through CH-E07) |
| 3. Medium Vulns | 1.5 weeks | Implement 8 medium vulns; build score board service |
| 4. Medium-Hard Vulns | 1.5 weeks | Race conditions, SSTI, SSRF, blind SQLi, SVG XSS |
| 5. Hard Vulns | 1 week | Prototype pollution, deserialization, chained attack scenarios |
| 6. Score Board + Tooling | 1 week | Score board UI, instructor dashboard, flag management |
| 7. Pilot Test | 1 week | Test with 3–5 advanced students; collect feedback |
| 8. Documentation | 0.5 weeks | Solutions guide, instructor materials, student briefing |

**Total: ~9.5 weeks.**

### 7.2 Acceptance Criteria

**Per phase**

- *Phase 1.* `docker-compose up` produces a running app at `:3000` with login, notes CRUD, orders, admin panel, and an empty score board service at `:3001`. Schema in [§5.3](#53-database-schema) deployed; seed data loaded.
- *Phase 2.* All 12 trivial+easy vulns exploitable by an instructor walkthrough in under 30 minutes; flags returned by the score board.
- *Phase 3.* All 8 medium vulns exploitable; score board validates and returns scaled scores; rate limiter active.
- *Phase 4–5.* All medium-hard and hard vulns exploitable, including the SSRF→admin chain end-to-end.
- *Phase 6.* Instructor view shows live progress for ≥ 5 simulated students; flag rotation script regenerates a working set.
- *Phase 7.* Pilot students reach a normal-distribution score range (40–85% completion); no false positives surface.
- *Phase 8.* `instructor/SOLUTIONS.md` walks every flag end-to-end; `ASSESSMENT_BRIEFING.md` matches [Appendix A](#appendix-a--sample-student-briefing).

**Global**

- All 32 vulnerabilities are exploitable and have unique flags.
- Docker setup completes in under 5 minutes on standard developer hardware (M1/M2 Mac, modern x86 laptop).
- Score board correctly validates all 30 flags; rejects malformed; rate-limits at 60/min.
- Average student finds all trivial + 5–7 easy in the first hour.
- No false-positive vulnerabilities (every finding the score board validates is intentional).
- Application supports 30 concurrent students per Docker host.
- Solution guide for instructors is complete and tested.

### 7.3 Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Students share flags via chat | Invalidates assessment | Per-student instances + flag rotation per cohort + monitor capture timing |
| Docker setup fails on student laptop | Wasted time | Pre-flight script validating Docker install + version; backup VM image on USB |
| Hard tier too hard — nobody finds them | Scoring imbalance | Pilot test; adjust difficulty if < 10% of pilot students find a hard vuln |
| Score board crashes during assessment | Cannot grade | Health monitoring + automatic restart; manual flag verification fallback (instructor's `flags_master.json`) |
| Vulnerability fix in dependency makes vuln un-exploitable | Vulns become non-findings | All deps pinned in `package.json`; CI smoke-tests confirm each vuln still returns its flag |
| Application is too easy — most score 90+ | Compresses grading | Difficulty calibration via pilot; adjust scoring weights or add deeper hard-tier vulns |

### 7.4 Future Enhancements

- GraphQL endpoint variant for testing introspection and batch attacks.
- Mobile app version (Android) testing client-side and platform-specific issues.
- Multi-tenant variant where the student must escape their tenant boundary.
- Cloud-deployed version (AWS/Azure) with cloud-specific misconfigurations.
- Time-limited mode for shorter assessments (90-minute version with 15 vulns).
- Adaptive difficulty: score board reveals hints if student is stuck > 20 min.

---

## Appendix A — Sample Student Briefing

This is the briefing students see at the start of the assessment.

```
CHALANEE — Final Capstone Assessment
=====================================

Welcome to your final capstone assessment. You have 4.5 hours.

TARGET: Chalanee, a personal digital vault application running locally
on your machine.

RULES OF ENGAGEMENT:
  1. You may test ONLY your own local instance.
  2. You may use any tool: Burp, ZAP, curl, scripts, AI assistants
     (with disclosure).
  3. You MUST capture flags via the score board to receive points.
  4. You MUST submit a professional penetration test report.
  5. Sharing flags with other students = academic misconduct.
  6. Modifying Chalanee source code to extract flags = academic
     misconduct.

SCORING:
  50% flag capture (87 raw points scaled to 50)
  50% report quality (50 points)
  60+ total to pass; 80+ for distinction; 90+ for mastery.

DELIVERABLES (due in 4.5 hours):
  • Score board completion screenshot
  • Professional penetration test report (template provided)
  • AI use disclosure (mandatory if used)

Begin when ready. Good hunting.
```

## Appendix B — Sample Flag Submission Flow

1. Student finds reflected XSS at `/search?q=<script>alert('XSSTEST')</script>`.
2. Alert appears; XSS confirmed executing.
3. Student observes the flag in the response body: `FLAG{search-reflects-everything}`.
4. Student opens the score board: `http://localhost:3001`.
5. Student enters their `assessment_id` and the captured flag.
6. Score board responds: *Flag valid! CH-E01 captured. +2 points. Total: 7. Rank: 5/22.*
7. Score board updates the leaderboard in real time.
8. Student documents the finding in their report with full evidence (request, response, screenshot, reproduction steps).

## Appendix C — Comparison to Existing Tools

| Aspect | Juice Shop | DVWA | WebGoat | Chalanee |
|---|---|---|---|---|
| Difficulty curve | Wide (very easy → expert) | Narrow (one level) | Lesson-based | 5 calibrated tiers |
| Time-boxed assessment | Not designed for it | Not designed for it | Lesson timer only | Yes — 4.5 hours |
| Score board | Yes (built-in) | No | Per-lesson | Yes + instructor view |
| Multi-user testing | Limited | No | No | Yes — 8 pre-seeded accounts |
| Modern stack | Outdated frontend | PHP | Java | Node + React |
| Course alignment | General | General | Stanford-style lessons | Aligned to specific course classes |
| Anti-cheating | None | None | None | Per-student instances + flag rotation |
| Report integration | No | No | No | Mandatory deliverable |

## Appendix D — Glossary

- **BOLA** — Broken Object-Level Authorization (API Top 10 #1, equivalent to IDOR).
- **BFLA** — Broken Function-Level Authorization (API Top 10 #5, vertical privilege escalation).
- **Flag** — A unique string in the format `FLAG{description-of-vuln}` placed in vulnerable responses or recoverable via exploitation.
- **IDOR** — Insecure Direct Object Reference (general web term, same concept as BOLA).
- **PRD** — Product Requirements Document (this document).
- **RoE** — Rules of Engagement; defines what is and is not authorized in a pentest.
- **Score Board** — Built-in service that validates flag submissions and tracks student progress.
- **SSRF** — Server-Side Request Forgery (API Top 10 #7).
- **SSTI** — Server-Side Template Injection.

---

*End of document. Chalanee PRD v2.0.*
