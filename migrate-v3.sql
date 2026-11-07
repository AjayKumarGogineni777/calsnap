-- One-time upgrade for databases created before fiber and exercise logging.
ALTER TABLE meals ADD COLUMN fiber REAL NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS exercises (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, name TEXT NOT NULL, minutes INTEGER, calories REAL NOT NULL);
