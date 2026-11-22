ALTER TABLE errors ADD COLUMN network_key TEXT;
CREATE INDEX errors_network ON errors (network_key, at);
CREATE INDEX errors_at ON errors (at);
CREATE INDEX admin_failures_at ON admin_failures (at);
