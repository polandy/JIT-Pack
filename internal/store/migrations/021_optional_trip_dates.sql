-- 021: Only the year is required for a trip (FR-2.1b)
--
-- FR-2.1a had already made the start date optional; the owner's decision
-- of 2026-08-14 goes the rest of the way. A trip is planned long before
-- its dates exist ("Samedan 2027"), and demanding an end date meant
-- inventing one — which then drove sorting and reads as knowledge the
-- household does not have.
--
-- The year takes over as the anchor the end date used to be: it is what
-- M2 sorts by and what a trip is called when nothing finer is known.
--
-- SQLite cannot ALTER column constraints, so this is the same 12-step
-- rebuild migration 004 used, including its dependent view.

PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS item_series_history;

CREATE TABLE trips_new (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    series_id  TEXT REFERENCES trip_series(id),
    name       TEXT NOT NULL,
    -- The one required temporal fact (FR-2.1b).
    year       INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
    start_date TEXT,                                     -- optional since FR-2.1a
    end_date   TEXT,                                     -- optional since FR-2.1b
    duration_days INTEGER GENERATED ALWAYS AS (
        CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL
             THEN CAST(julianday(end_date) - julianday(start_date) AS INTEGER) + 1
             ELSE NULL
        END
    ) STORED,
    status     TEXT NOT NULL DEFAULT 'planning'
               CHECK (status IN ('planning','active','repack','archived')),
    attributes TEXT CHECK (attributes IS NULL OR json_valid(attributes)),
    imported   INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
    created_by TEXT REFERENCES users(id),
    -- Added by 005 for the master feed. A rebuild has to carry *every*
    -- column the table has grown since the shape it is copied from: the
    -- first draft of this migration was modelled on 004 and silently
    -- dropped this one, which broke every master pull of a trip.
    updated_hlc TEXT NOT NULL DEFAULT '',
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

-- Every existing trip had a required end date, so its year is known
-- exactly. COALESCE guards nothing today and costs nothing; it keeps the
-- statement correct if this migration is ever replayed after 021.
INSERT INTO trips_new (id, series_id, name, year, start_date, end_date, status,
                       attributes, imported, created_by, updated_hlc)
SELECT id, series_id, name,
       CAST(strftime('%Y', COALESCE(end_date, start_date)) AS INTEGER),
       start_date, end_date, status, attributes, imported, created_by, updated_hlc
FROM trips;

DROP TABLE trips;
ALTER TABLE trips_new RENAME TO trips;

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
