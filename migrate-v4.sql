-- One-time upgrade for databases created before workout tracking and meal types.
ALTER TABLE meals ADD COLUMN meal_type TEXT;
CREATE TABLE IF NOT EXISTS sets (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, exercise TEXT NOT NULL, reps INTEGER, weight REAL, seconds INTEGER, km REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS sets_exercise_date ON sets(exercise, date);
