-- 004: Make trip start_date optional (FR-2.1a)
--
-- SQLite cannot ALTER column constraints. We use the recommended
-- 12-step table rebuild approach: disable FK checks, recreate the
-- table, copy data, drop old, rename new, re-enable FKs.

PRAGMA foreign_keys = OFF;

-- Drop dependent view first
DROP VIEW IF EXISTS item_series_history;

-- Rebuild trips table with nullable start_date
CREATE TABLE trips_new (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    series_id  TEXT REFERENCES trip_series(id),
    name       TEXT NOT NULL,
    start_date TEXT,                                                    -- now optional (FR-2.1a)
    end_date   TEXT NOT NULL,
    duration_days INTEGER GENERATED ALWAYS AS (
        CASE WHEN start_date IS NOT NULL
             THEN CAST(julianday(end_date) - julianday(start_date) AS INTEGER) + 1
             ELSE NULL
        END
    ) STORED,
    status     TEXT NOT NULL DEFAULT 'planning'
               CHECK (status IN ('planning','active','repack','archived')),
    attributes TEXT CHECK (attributes IS NULL OR json_valid(attributes)),
    imported   INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
    created_by TEXT REFERENCES users(id),
    CHECK (start_date IS NULL OR end_date >= start_date)
);

INSERT INTO trips_new (id, series_id, name, start_date, end_date, status, attributes, imported, created_by)
SELECT id, series_id, name, start_date, end_date, status, attributes, imported, created_by
FROM trips;

DROP TABLE trips;
ALTER TABLE trips_new RENAME TO trips;

-- Recreate the view
CREATE VIEW item_series_history AS
SELECT t.series_id,
       ti.source_item_id,
       ti.name,
       t.id            AS trip_id,
       t.name          AS trip_name,
       t.start_date,
       t.duration_days,
       ti.quantity,
       ti.flag_unused,
       ti.flag_missing
FROM trip_items ti
JOIN trips t ON t.id = ti.trip_id
WHERE t.status = 'archived' AND t.series_id IS NOT NULL;

PRAGMA foreign_keys = ON;
