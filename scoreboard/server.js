'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = parseInt(process.env.PORT || '3001', 10);
const INSTRUCTOR_TOKEN = process.env.INSTRUCTOR_TOKEN || 'instructor-default-change-me';
const DATA_PATH = process.env.DATA_PATH || '/data/scoreboard.json';
const FLAGS_PATH = path.join(__dirname, 'flags.json');

const FLAGS = JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf8'));
const TOTAL_FLAG_POINTS = Object.values(FLAGS).reduce((s, f) => s + f.points, 0);
// CH-T03 + CH-T04 = +2 evidence-only points awarded via report rubric.
const MAX_POSSIBLE_RAW = TOTAL_FLAG_POINTS + 2;

// State
let state = loadState();
const submissionLog = new Map(); // assessment_id -> array of timestamps (rolling 60s)

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (_) {
    return { students: {} };
  }
}
function saveState() {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('[scoreboard] save failed:', e.message); }
}

function normalizeAssessmentId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,63}$/.test(id)) return null;
  return id;
}

function normalizeDisplayName(value, fallback) {
  const name = String(value || '').trim() || fallback;
  if (name.length > 60 || /[\x00-\x1F\x7F<>]/.test(name)) return null;
  return name;
}

// ---- app ----
const app = express();
app.use(express.json());

// Permissive CORS so the app and the scoreboard can talk freely.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- POST /api/students/register ----
app.post('/api/students/register', (req, res) => {
  const assessment_id = normalizeAssessmentId(req.body && req.body.assessment_id);
  if (!assessment_id) {
    return res.status(400).json({
      error: 'invalid_assessment_id',
      detail: 'Use 3-64 letters, numbers, dots, underscores, colons, or hyphens.',
    });
  }
  const display_name = normalizeDisplayName(req.body && req.body.display_name, assessment_id);
  if (!display_name) {
    return res.status(400).json({
      error: 'invalid_display_name',
      detail: 'Use 1-60 visible characters without markup.',
    });
  }
  if (!state.students[assessment_id]) {
    state.students[assessment_id] = {
      assessment_id,
      display_name,
      registered_at: new Date().toISOString(),
      captures: [],
      total_points: 0,
    };
    saveState();
  }
  res.json({ ok: true, student: state.students[assessment_id] });
});

// ---- POST /api/flags/submit ----
app.post('/api/flags/submit', (req, res) => {
  const assessment_id = normalizeAssessmentId(req.body && req.body.assessment_id);
  const flag = req.body && req.body.flag;
  if (!assessment_id || !flag) {
    return res.status(400).json({ error: 'assessment_id and flag required' });
  }
  const student = state.students[assessment_id];
  if (!student) return res.status(404).json({ error: 'unknown_assessment_id' });

  // Rate limit: 60 submissions/min/assessment
  const now = Date.now();
  const log = submissionLog.get(assessment_id) || [];
  const recent = log.filter(t => now - t < 60_000);
  if (recent.length >= 60) {
    submissionLog.set(assessment_id, recent);
    const oldest = Math.min(...recent);
    return res.status(429).json({
      error: 'rate_limited',
      retry_after_seconds: Math.ceil((60_000 - (now - oldest)) / 1000),
    });
  }
  recent.push(now);
  submissionLog.set(assessment_id, recent);

  const trimmed = String(flag).trim();
  const meta = FLAGS[trimmed];
  if (!meta) return res.json({ valid: false, reason: 'unknown_flag' });

  const dup = student.captures.find(c => c.vuln_id === meta.vuln_id);
  if (dup) {
    return res.json({
      valid: false,
      reason: 'duplicate',
      vuln_id: meta.vuln_id,
      originally_captured_at: dup.captured_at,
    });
  }

  const capture = {
    vuln_id: meta.vuln_id,
    tier: meta.tier,
    points: meta.points,
    captured_at: new Date().toISOString(),
  };
  student.captures.push(capture);
  student.total_points = student.captures.reduce((s, c) => s + c.points, 0);
  saveState();

  // Compute rank
  const ranked = Object.values(state.students)
    .sort((a, b) => b.total_points - a.total_points || a.captures.length - b.captures.length);
  const rank = ranked.findIndex(s => s.assessment_id === assessment_id) + 1;

  res.json({
    valid: true,
    vuln_id: meta.vuln_id,
    tier: meta.tier,
    points_awarded: meta.points,
    total_points: student.total_points,
    max_possible: MAX_POSSIBLE_RAW,
    rank,
    captured_at: capture.captured_at,
  });
});

// ---- GET /api/scoreboard/me ----
app.get('/api/scoreboard/me', (req, res) => {
  const aid = normalizeAssessmentId(req.query.assessment_id);
  if (!aid) return res.status(400).json({ error: 'assessment_id required' });
  const student = state.students[aid];
  if (!student) return res.status(404).json({ error: 'unknown_assessment_id' });

  const ranked = Object.values(state.students)
    .sort((a, b) => b.total_points - a.total_points || a.captures.length - b.captures.length);
  const rank = ranked.findIndex(s => s.assessment_id === aid) + 1;

  const start = new Date(student.registered_at).getTime();
  const elapsed = Date.now() - start;
  const h = Math.floor(elapsed / 3600_000);
  const m = Math.floor((elapsed % 3600_000) / 60_000);
  const s = Math.floor((elapsed % 60_000) / 1000);

  res.json({
    assessment_id: aid,
    display_name: student.display_name,
    discovered: student.captures,
    total_points: student.total_points,
    max_possible: MAX_POSSIBLE_RAW,
    rank,
    time_elapsed: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
  });
});

// ---- GET /api/scoreboard/instructor ----
app.get('/api/scoreboard/instructor', (req, res) => {
  const auth = req.headers.authorization || '';
  if (!auth.endsWith(INSTRUCTOR_TOKEN)) {
    return res.status(401).json({ error: 'instructor_token_required' });
  }
  const ranked = Object.values(state.students)
    .sort((a, b) => b.total_points - a.total_points || a.captures.length - b.captures.length);
  res.json({
    students: ranked.map(s => ({
      assessment_id: s.assessment_id,
      display_name: s.display_name,
      total_points: s.total_points,
      captures: s.captures,
      last_capture_at: s.captures.length
        ? s.captures[s.captures.length - 1].captured_at
        : null,
    })),
    max_possible: MAX_POSSIBLE_RAW,
  });
});

// ---- GET /api/leaderboard (public) ----
app.get('/api/leaderboard', (req, res) => {
  const ranked = Object.values(state.students)
    .sort((a, b) => b.total_points - a.total_points || a.captures.length - b.captures.length)
    .map((s, i) => ({
      rank: i + 1,
      display_name: s.display_name,
      total_points: s.total_points,
      vulns_found: s.captures.length,
    }));
  res.json({ leaderboard: ranked, max_possible: MAX_POSSIBLE_RAW });
});

// ---- health ----
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Score board ready at http://localhost:${PORT}`);
  console.log(`  Total flag points: ${TOTAL_FLAG_POINTS}; max raw with evidence: ${MAX_POSSIBLE_RAW}`);
});
