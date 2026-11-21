-- JavaScript errors sent by approved PCs, shown on the admin page.
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_code TEXT NOT NULL,
  player TEXT,
  page TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  version TEXT,
  agent TEXT,
  happened_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX errors_received ON errors (received_at);
