# Instructor Materials

> **Do not distribute.** This directory should be excluded from the student-facing repo.

- `SOLUTIONS.md` — step-by-step exploitation walkthrough for all 30 vulnerabilities.
- `GRADING_RUBRIC.md` — grading mechanics and workflow.
- `flags_master.json` — cleartext flag map (matches `scoreboard/flags.json`).

## Distribution

When publishing the student repo, exclude this directory:

```bash
git filter-repo --path instructor --invert-paths
```

(Or simply maintain two branches/repos: a `dev` branch with the instructor folder, a `student` branch without.)

## Flag rotation between cohorts

`flags_master.json` and `scoreboard/flags.json` contain the canonical flag strings. To regenerate for a new cohort:

1. Generate new `FLAG{...}` strings (keep memorable hyphenated style).
2. Update both files in lockstep.
3. Update the embedded flags in source — most are obvious string literals (e.g., `'FLAG{...}'` in route handlers, `# FLAG{...}` in static files).
4. Bump the seed in `app/server/db/connection.js` for `_ctf_flags` and the admin user's `internal_notes`.
5. Bump `HARD_TIER_FLAG_H01` and `HARD_TIER_FLAG_H04` env vars in `docker-compose.yml`.
