-- 023 — §3.33: the meal plan — a trip's meals and their ingredients. Additive
-- only; the comments explaining the columns live in schema.sql (ADR-067
-- driver 4).

CREATE TABLE meals (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    on_date     TEXT NOT NULL,
    slot        TEXT NOT NULL DEFAULT 'dinner'
                CHECK (slot IN ('breakfast', 'lunch', 'snack', 'dinner')),
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'cook' CHECK (kind IN ('cook', 'out')),
    at_time     TEXT,
    note        TEXT,
    place       TEXT,
    cook_user_id TEXT REFERENCES users(id),
    excursion_id TEXT REFERENCES excursions(id) ON DELETE SET NULL,
    excursion_packed_at TEXT,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE meal_ingredients (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    meal_id     TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    amount      TEXT,
    list        TEXT NOT NULL DEFAULT 'buy_local' CHECK (list IN ('buy_before', 'buy_local')),
    position    INTEGER,
    bought      INTEGER NOT NULL DEFAULT 0 CHECK (bought IN (0, 1)),
    bought_at         TEXT,
    bought_by_user_id TEXT REFERENCES users(id),
    shopping_position INTEGER,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_meals_trip ON meals (trip_id, on_date);
CREATE INDEX idx_meal_ingredients_meal ON meal_ingredients (meal_id);
