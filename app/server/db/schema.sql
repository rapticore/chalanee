-- Chalanee SQLite schema. See PRD §5.3.

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  bio             TEXT,
  avatar_path     TEXT,
  role            TEXT NOT NULL DEFAULT 'user',
  is_admin        INTEGER NOT NULL DEFAULT 0,
  mfa_secret      TEXT,
  internal_notes  TEXT,
  ssn             TEXT,
  preferences     TEXT NOT NULL DEFAULT '{}',
  email_template  TEXT,
  created_via     TEXT NOT NULL DEFAULT 'normal',
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT,
  tags        TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_shares (
  note_id     INTEGER NOT NULL REFERENCES notes(id),
  shared_with INTEGER NOT NULL REFERENCES users(id),
  permission  TEXT NOT NULL,
  PRIMARY KEY (note_id, shared_with)
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  plan        TEXT NOT NULL,
  quantity    INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  coupon_code TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  code            TEXT PRIMARY KEY,
  discount_pct    INTEGER,
  discount_cents  INTEGER,
  used            INTEGER NOT NULL DEFAULT 0,
  redeemed_by     TEXT,
  expires_at      TEXT,
  admin_only      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS webhooks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  url          TEXT NOT NULL,
  event        TEXT NOT NULL,
  last_status  INTEGER,
  last_body    TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),
  state_blob   TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  upgraded_at  TEXT
);

-- Internal helper for CH-MH01 blind SQLi exfil target
CREATE TABLE IF NOT EXISTS _ctf_flags (
  id    INTEGER PRIMARY KEY,
  flag  TEXT NOT NULL
);
