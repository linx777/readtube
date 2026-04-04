CREATE TABLE IF NOT EXISTS popular_videos (
  video_id TEXT PRIMARY KEY,
  source_title TEXT NOT NULL,
  source_author TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_popular_videos_rank
ON popular_videos (view_count DESC, updated_at DESC);
