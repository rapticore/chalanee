# Chalanee

> **WARNING.** This application is **deliberately vulnerable.** Do not deploy it to the public internet. Run only on your local machine inside Docker.

Chalanee is the final capstone target for the *Web Application Penetration Testing with AI-Assisted Security Testing* course. It contains 30 calibrated vulnerabilities across 5 difficulty tiers.

Students should start with `ASSESSMENT_BRIEFING.md`. Instructor and build-planning material is not required during the assessment.

## Quick Start

```bash
git clone <repo-url>
cd chalanee
docker compose up --build
```

Wait for `Chalanee ready at http://localhost:3000` in the logs. Then open:

| URL | Service |
|---|---|
| http://localhost:3000 | Chalanee application |
| http://localhost:3001 | Score board (flag submission + leaderboard) |
| http://localhost:1080 | MailHog (catches password-reset emails) |

## Custom ports (if defaults are in use)

If port 3000, 3001, 1080, or 1025 is already in use on your machine, override via a `.env` file:

```bash
cp .env.example .env
# edit .env to set whichever ports you need:
#   APP_PORT=8080
#   SCOREBOARD_PORT=8081
#   MAILHOG_UI_PORT=8082
#   MAILHOG_SMTP_PORT=8025
docker compose up --build
```

Only the host-side mapping changes; the in-container ports stay fixed (so internal cross-service URLs like `http://chalanee-scoreboard:3001` keep working). Update the URLs you visit in the browser accordingly.

## Assessment Flow

Read `ASSESSMENT_BRIEFING.md` first. Short version:

1. Register your assessment ID on the score board.
2. Hunt vulnerabilities in the app and capture scoring tokens from your testing traffic.
3. Submit captured tokens to the score board.
4. Document each finding in your professional report (template provided).
5. Submit (a) score board screenshot, (b) report, (c) any custom tooling repo.

## Reset

To reset a student's instance to a fresh state:

```bash
docker-compose down -v
docker-compose up --build
```

The `-v` flag deletes the `app-data` and `scoreboard-data` volumes.

## Forbidden

- Sharing flags with other students.
- Decompiling the score board to extract flags.
- Modifying Chalanee source code to reveal flags.
- Exploiting other students' instances.
