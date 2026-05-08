'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../data/chalanee.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const isFresh = !fs.existsSync(DB_PATH);
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  _db.exec(schema);

  // Seed if the users table is empty (treats fresh + half-built as fresh)
  const userCount = _db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    seed(_db);
    if (isFresh) console.log('[db] seeded fresh database at', DB_PATH);
    else console.log('[db] re-seeded empty database at', DB_PATH);
  }
  return _db;
}

function seed(db) {
  // Deliberately weak bcrypt cost — A04 cryptographic failures finding.
  const hash = (pw) => bcrypt.hashSync(pw, 4);

  // ---- users ----
  // Admin (id=1) — discoverable via CH-T01 default credentials.
  // The internal_notes field carries the CH-M04 flag.
  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, bio, role, is_admin,
                       mfa_secret, internal_notes, ssn, preferences,
                       email_template, created_via)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'admin@chalanee.com', hash('admin123'), 'Chalanee Admin',
    'Site administrator. Contact for support.',
    'admin', 1,
    'JBSWY3DPEHPK3PXP', // base32 TOTP secret
    'FLAG{api-said-too-much}',
    '900-00-0001',
    '{}',
    'Hello {{name}}, regards — Chalanee Team',
    'normal'
  );

  const reg = [
    ['alice@test.com', 'Alice Cooper', 'Loves notes about cocktails.'],
    ['bob@test.com', 'Bob Ross', 'Happy little notes only.'],
    ['charlie@test.com', 'Charlie Brown', 'Good grief, another note.'],
    ['dave@test.com', 'Dave Grohl', 'Drum sticks and notes.'],
    ['eve@test.com', 'Eve Polastri', 'Nothing to see here.'],
  ];
  for (const [email, name, bio] of reg) {
    insertUser.run(email, hash('Password1!'), name, bio,
      'user', 0, null, 'no internal notes', '000-00-0000', '{}',
      'Best regards, ' + name, 'normal');
  }

  insertUser.run('premium1@test.com', hash('Password1!'), 'Pat Premium',
    'Premium plan user.', 'premium', 0, null, 'premium tier user',
    '111-11-1111', '{}', 'Cheers, Pat', 'normal');
  insertUser.run('premium2@test.com', hash('Password1!'), 'Quinn Enterprise',
    'Enterprise plan user.', 'premium', 0, null, 'enterprise tier user',
    '222-22-2222', '{}', 'Best, Quinn', 'normal');

  // ---- notes ----
  const insertNote = db.prepare(`
    INSERT INTO notes (owner_id, title, content, category, tags) VALUES (?, ?, ?, ?, ?)
  `);
  const noteCategories = ['personal', 'work', 'finance', 'travel', 'recipes', 'passwords', 'ideas'];
  const sample = [
    ['Bank PIN', 'My bank PIN is 4271 (do not share)', 'finance', 'pin,bank'],
    ['Wifi password', 'Home wifi: hunter2hunter2', 'personal', 'home'],
    ['Project notes', 'Q3 roadmap: ship feature X by Friday', 'work', 'roadmap'],
    ['Recipe — pesto', '2 cups basil, 1/2 cup pine nuts, parmesan, olive oil', 'recipes', 'italian'],
    ['Travel — Lisbon', 'Hotel: Avenida; flight: TP1234', 'travel', 'portugal'],
    ['Reading list', '1) Designing Data Intensive Apps 2) Crafting Interpreters', 'ideas', 'books'],
    ['Gym log', 'Squat 5x5 @ 185lb', 'personal', 'fitness'],
    ['Side project ideas', 'A federated guestbook over ActivityPub', 'ideas', 'projects'],
    ['Tax notes', 'Estimated quarterly: $2400', 'finance', 'taxes'],
    ['Random shopping list', 'milk, bread, eggs', 'personal', 'shopping'],
  ];
  // Distribute notes across the 7 user accounts (ids 2..8)
  let noteCount = 0;
  for (let uid = 2; uid <= 8; uid++) {
    const target = uid === 2 ? 8 : uid === 3 ? 12 : uid === 4 ? 6 : uid === 5 ? 4 : uid === 6 ? 10 : 4;
    for (let i = 0; i < target; i++) {
      const s = sample[(noteCount + i) % sample.length];
      insertNote.run(uid, `${s[0]} (#${i + 1})`, s[1], s[2], s[3]);
    }
    noteCount += target;
  }

  // Share some notes for FR-NOTE-03 testing
  const insertShare = db.prepare(`INSERT INTO note_shares (note_id, shared_with, permission) VALUES (?, ?, ?)`);
  insertShare.run(1, 3, 'view');   // alice's first note shared with bob
  insertShare.run(2, 4, 'edit');   // alice's second note shared with charlie

  // ---- orders ----
  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, plan, quantity, price_cents, total_cents, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const orderSeed = [
    [2, 'premium', 1, 999, 999, 'paid'],
    [2, 'premium', 1, 999, 999, 'paid'],
    [3, 'enterprise', 1, 4999, 4999, 'paid'],
    [4, 'premium', 1, 999, 999, 'pending'],
    [4, 'premium', 1, 999, 999, 'paid'],
    [4, 'premium', 1, 999, 999, 'paid'],
    [6, 'enterprise', 1, 4999, 4999, 'paid'],
    [6, 'premium', 1, 999, 999, 'paid'],
    [6, 'premium', 1, 999, 999, 'paid'],
    [6, 'premium', 1, 999, 999, 'paid'],
    [7, 'premium', 1, 999, 999, 'paid'],
    [8, 'enterprise', 1, 4999, 4999, 'paid'],
  ];
  for (const o of orderSeed) insertOrder.run(...o);

  // ---- coupons ----
  const insertCoupon = db.prepare(`
    INSERT INTO coupons (code, discount_pct, discount_cents, used, expires_at, admin_only)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertCoupon.run('WELCOME10', 10, null, 0, '2099-01-01T00:00:00Z', 0);
  insertCoupon.run('BLACKFRIDAY', 25, null, 0, '2024-12-01T00:00:00Z', 0);  // expired
  insertCoupon.run('VIP100', 100, null, 0, '2099-01-01T00:00:00Z', 1);  // admin-only

  // ---- _ctf_flags (CH-MH01 exfil target) ----
  db.prepare(`INSERT INTO _ctf_flags (id, flag) VALUES (1, 'FLAG{blind-but-talkative}')`).run();
}

module.exports = { getDb, DB_PATH };
