-- The saves stay on each PC: no approval, no backup. The database now keeps anonymous statistics
-- for the admin page. No PC ever saved to the server, so the old tables hold nothing to keep.
DROP TABLE devices;
DROP TABLE saves;
DROP TABLE history;
-- Errors now come from any PC, by the first 6 letters of its id.
DROP TABLE errors;
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pc TEXT NOT NULL,
  page TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  agent TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX errors_pc ON errors (pc, at);

-- One row per PC, by the random id it made. No IP address, no save.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,   -- YYYY-MM-DD, UTC
  last_day TEXT NOT NULL
);

-- The PCs seen each day, for the active players. Kept 90 days (VISIT_DAYS in src/util.ts).
CREATE TABLE visits (
  day TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (day, id)
);

-- Games started and won, counted per day and game.
CREATE TABLE plays (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  kind TEXT NOT NULL,        -- start or won
  n INTEGER NOT NULL,
  PRIMARY KEY (day, game, kind)
);
