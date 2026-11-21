-- ip: the network a pending PC registered from, to limit how many PCs one network can add.
ALTER TABLE devices ADD COLUMN ip TEXT;
-- Wrong admin passwords, by network, to slow down guessing.
CREATE TABLE admin_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX admin_failures_ip ON admin_failures (ip, at);
