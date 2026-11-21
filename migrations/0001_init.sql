-- PCs that opened the library. A PC can save only once approved.
-- Approved PCs with the same player share the same saves (a new PC gets the old one's progress).
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  player TEXT,
  name TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_write INTEGER
);

-- The newest save of each game for each player.
CREATE TABLE saves (
  player TEXT NOT NULL,
  game TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  summary TEXT,
  PRIMARY KEY (player, game)
);

-- The last 30 versions of each save, to undo a bad update.
CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  game TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);
CREATE INDEX history_player_game ON history (player, game, id);
