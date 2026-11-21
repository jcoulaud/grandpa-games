-- device: the PC that wrote each save. rev: a number the server raises on each accepted save.
-- A PC names the rev it last saw; the server refuses its upload if another PC saved since.
-- PC clocks never decide the order of saves.
ALTER TABLE saves ADD COLUMN device TEXT;
ALTER TABLE saves ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
