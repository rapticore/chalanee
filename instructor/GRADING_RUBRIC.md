# Chalanee — Grading Rubric

See PRD §4.6 (`PRD.md`) for the full rubric. This file documents grading mechanics.

## Components

- **Flag capture (50%)** — automated by the score board. Final flag score = `(raw / 87) × 50`, where raw counts captured-flag points + 2 evidence points (CH-T03 + CH-T04 documented in the report).
- **Report quality (50%)** — manual against the 8-dimension rubric.

## Bonus

- +2 to the first student to capture any Hard-tier flag.
- +1 to the first student to capture all 5 Trivial findings (CH-T01, T02, T05 via flags + T03, T04 via evidence in report).

## Grading Workflow

1. After the assessment window closes, pull instructor leaderboard:
   ```bash
   curl -H "Authorization: Bearer $INSTRUCTOR_TOKEN" \
     http://<host>:3001/api/scoreboard/instructor > leaderboard.json
   ```
2. For each student, evaluate the report against the 8 rubric dimensions.
3. For each student, award T03 + T04 evidence points (1pt each, 2pt total) if documented with screenshot/curl evidence.
4. Compute final = `(captured_raw + evidence) / 87 × 50 + report_score`.
5. Apply bonuses.

## Letter grade scale

| Total score | Letter | Description |
|---|---|---|
| 90–100 | A | Mastery |
| 80–89  | B | Distinguished |
| 70–79  | C | Proficient |
| 60–69  | D | Passing |
| < 60   | F | Insufficient |
