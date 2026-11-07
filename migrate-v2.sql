-- One-time upgrade for databases created before favourites and water tracking.
ALTER TABLE meals ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS water (date TEXT PRIMARY KEY, ml INTEGER NOT NULL);
