CREATE TABLE IF NOT EXISTS video_tags (
  key TEXT PRIMARY KEY,
  source_id TEXT,
  vod_id TEXT,
  title TEXT NOT NULL,
  year TEXT,
  vip INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_tags_vip ON video_tags(vip, updated_at DESC);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('vipAll', '0'),
  ('vipAutoSearch', '1'),
  ('vipLabel', 'VIP'),
  ('inviteOnly', '0'),
  ('welcomePoints', '50');
