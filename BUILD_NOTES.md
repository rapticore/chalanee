# Build Notes

This file documents implementation decisions, deviations from `PRD.md`, and known caveats.

## Deviations from the PRD

### 1. Frontend: EJS server-side rendering, not React + Vite

**PRD §2.3** specifies React 18 + Vite. The build uses **EJS server-side rendering** instead.

Reasons:

- EJS is already a required dep for CH-H01 (SSTI), so we already pay its install cost.
- All 30 vulnerabilities are testable via curl/Burp regardless of how the UI renders. The PRD's vuln specs are API-shape, not React-shape.
- A real Vite build adds 200+ MB of node_modules and ~30 s to every cold container build, hurting the "<5 min setup" acceptance criterion.
- CH-M01 (stored XSS in bio) renders more naturally in a server-rendered EJS page (`<%- profile.bio %>`) than via `dangerouslySetInnerHTML`, and the bug is easier to trigger interactively.
- The "JS bundle" for CH-E05 is a single hand-written `app/server/public/static/js/main.js` shaped to look like a Vite-emitted bundle.

If you later need a real React frontend (e.g., to teach DOM-based XSS specifically), `app/client/` is the slot to add it; the Express server already serves `/static/*` and the API contracts are stable.

### 2. Scoreboard tracks 28 flag-capturable vulns; T03 + T04 are evidence-only

**PRD §3.3** marks CH-T03 (verbose Server header) and CH-T04 (missing security headers) as `Capture Flag: N/A (informational, evidence-based)`. They contribute 1 pt each toward the 87-point raw total, but are awarded by the instructor on report review, not by the score board.

The score board's `max_possible` field is **87** (matches PRD); the difference (2 pts) is documented as evidence-only in `instructor/flags_master.json` and `instructor/GRADING_RUBRIC.md`.

### 3. Catalog addition: CH-E08 (BOLA on notes)

Added during build because the notes read paths shared the same vulnerability class as the user-profile IDOR (CH-E03) but at a different object surface. The user-profile finding only credited cross-user *user* fetches; cross-user *note* reads went unscored. Splitting them into separate flags matches how a real penetration-test report would itemize two distinct findings against the same authorization-model gap.

- ID: **CH-E08** · Easy · 2 pts
- Flag: `FLAG{bola-on-notes-read-everything}`
- Locations: `GET /api/notes/:id` and `/notes/:id/edit` for any authed non-admin viewer where `viewer.id ≠ note.owner_id`.
- Write paths (`PATCH /api/notes/:id`, `DELETE /api/notes/:id`) still enforce ownership — the asymmetric "read leaky, write enforced" pattern is preserved as the realistic shape.

### 3a. Catalog addition: CH-MH07 (unauth internal admin user list)

Added because `GET /api/internal/admin/users` returned the full user list with no authentication and no scoring. It's the read-only sibling of CH-H03 (admin password reset via the same trust flaw). The pedagogical lesson is: *internal endpoints shouldn't trust source IPs*, and bare-port-mapping a service in docker-compose exposes "internal" routes to the host.

- ID: **CH-MH07** · Medium-Hard · 4 pts
- Flag: `FLAG{internal-api-was-public}`
- Location: `GET /api/internal/admin/users` (no auth required).
- Distinct from CH-H03 (write/takeover) and CH-MH06 (legacy v1 router) — same vuln *family* (improper inventory + missing auth on internal routes), three distinct findings.

These bring totals to: **32 vulnerabilities, 93 raw points** (Easy tier 8 / 16 pts, Medium-Hard tier 7 / 28 pts; everything else unchanged). The score-board's `max_possible` is computed at runtime from `flags.json` (+2 for evidence-only T03/T04), so it updates automatically.

### 4. CH-H03 internal-IP trust is broader than "127.0.0.1 only"

**PRD §3.3 CH-H03** describes the internal endpoint as trusting `127.0.0.1`/`::1`. In Docker, however, an SSRF originating from `chalanee-app` to itself can appear as a non-loopback address depending on how `axios` resolves the target. To make the chain reliably exploitable from inside the docker network, `app/server/routes/internal.js` also trusts RFC1918 ranges (`10.0.0.0/8`, `172.16/12`, `192.168/16`).

This widens the attack surface but matches realistic "internal network" trust models. Documented in `instructor/SOLUTIONS.md`.

## What's deliberately weak

| Setting | Value | Why |
|---|---|---|
| bcrypt cost | 4 | Cryptographic-failure finding (A04) |
| `helmet` | not registered | CH-T04 |
| CORS | reflected origin + credentials | CH-M06 |
| JWT bearer handling | trusts `alg:none` before verification | CH-M05 |
| Cookie flags | none | CH-E04 |
| Error handler | leaks stack traces | A10:2025 |
| `node-serialize` | 0.0.4 | CH-H04 |
| Rate limiting | only on score board | API4 finding |
| `express.disable('etag')` | true | reduces test flakiness, not a vuln |

## Configurable ports

All four host ports (app 3000, scoreboard 3001, mailhog UI 1080, mailhog SMTP 1025) are overridable via a `.env` file at the repo root. Copy `.env.example` to `.env` and set whichever variables you need (`APP_PORT`, `SCOREBOARD_PORT`, `MAILHOG_UI_PORT`, `MAILHOG_SMTP_PORT`). The in-container ports stay fixed because they're part of the inter-container DNS-resolved URLs (e.g., `http://chalanee-scoreboard:3001`).

The CH-M06 CORS canary at `/api/_canary/cors` is port-tolerant: any `http(s)://localhost:*` or `http(s)://127.0.0.1:*` origin is treated as same-origin, so the flag does not falsely fire when the app runs on a non-default port.

## Quick smoke test

```bash
docker compose build       # ~3–5 min on first build (better-sqlite3 native compile)
docker compose up -d
curl -I http://localhost:3000/
curl http://localhost:3001/health
docker compose down -v                                    # tear down + drop volumes
```

Score board registration:

```bash
curl -X POST http://localhost:3001/api/students/register \
  -H 'Content-Type: application/json' \
  -d '{"assessment_id":"smoke-test","display_name":"Smoke Test"}'
```

Detailed exploit smoke checks are kept in `instructor/SOLUTIONS.md`.

## Known caveats / TODOs

- **2FA / TOTP** (FR-USER-05) is *modeled* in the schema (`mfa_secret` column) but no `/api/auth/2fa` endpoint is implemented. No vuln depends on it being live; it exists as a leaked field for CH-M04.
- **Aggregate metrics dashboard** (FR-ADMIN-05) — only `/api/admin/users` and `/api/admin/orders` are implemented; the metrics view is not. No vuln depends on it.
- **Avatar SVG canary** depends on the browser actually rendering the SVG and firing the embedded script. Modern browsers may sandbox SVGs served as `image/svg+xml`; for a reliable CH-MH02 test, students should open the file directly via the URL bar (not as an `<img>` tag).
- **Race condition (CH-MH03)** uses a 100 ms artificial sleep between read and write. This makes the race trivially exploitable with 2 concurrent requests; tighten to 0–30 ms if the assessment becomes too easy.
- **CH-H04 deserialization** — `node-serialize@0.0.4` is published but unmaintained. If npm ever removes the package, vendor it into the repo.
- **`instructor/`** directory is **NOT** excluded from this dev repo; before publishing the student-facing repo, see `instructor/README.md` for the filter command.
