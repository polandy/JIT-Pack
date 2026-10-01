-- 016 — FR-29.17: GPX tracks on an idea. The synced row and its file, in two
-- tables so the file stays outside the sync envelope (ADR-002, ADR-085). The
-- comments explaining their shape live in schema.sql (ADR-067 driver 4).

CREATE TABLE idea_tracks (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    idea_id     TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    file_name   TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
    kind        TEXT NOT NULL DEFAULT 'hike' CHECK (kind IN ('hike','bike')),
    with_kid    INTEGER NOT NULL DEFAULT 0 CHECK (with_kid IN (0,1)),
    pause_min   INTEGER NOT NULL DEFAULT 0 CHECK (pause_min BETWEEN 0 AND 480),
    position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    gpx_hash    TEXT NOT NULL,
    distance_m  INTEGER NOT NULL CHECK (distance_m >= 0),
    ascent_m    INTEGER CHECK (ascent_m IS NULL OR ascent_m >= 0),
    descent_m   INTEGER CHECK (descent_m IS NULL OR descent_m >= 0),
    max_ele_m   INTEGER,
    point_count INTEGER NOT NULL CHECK (point_count >= 2),
    line        TEXT NOT NULL CHECK (length(line) BETWEEN 1 AND 16000),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE idea_track_gpx (
    track_id   TEXT PRIMARY KEY REFERENCES idea_tracks(id) ON DELETE CASCADE,
    gpx        BLOB NOT NULL,
    CHECK (length(gpx) <= 5242880)
);

CREATE INDEX idx_idea_tracks_idea ON idea_tracks (idea_id);
