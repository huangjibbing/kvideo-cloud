-- KVideo Cloud · initial schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
  points INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  membership TEXT NOT NULL DEFAULT 'free' CHECK (membership IN ('free', 'plus', 'pro', 'lifetime')),
  membership_expires_at TEXT,
  avatar TEXT NOT NULL DEFAULT '🍿',
  streak INTEGER NOT NULL DEFAULT 0,
  last_checkin_at TEXT,
  invited_by TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  title_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  accent TEXT NOT NULL,
  motif TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  title_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  accent TEXT NOT NULL,
  motif TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  episode_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source_key, episode_id)
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS points_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  reward INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  used_by TEXT,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_owner ON invites(owner_id);

CREATE TABLE IF NOT EXISTS custom_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_sources_user ON custom_sources(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_source ON comments(source_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('adMode', 'strict'),
  ('adKeywords', ''),
  ('announcement', '纯净播放计划已上线：严格过滤 m3u8 切片中的插播广告，并为每一部作品保留完整时间轴。'),
  ('registrationOpen', '1'),
  ('watchRewardEnabled', '1');
