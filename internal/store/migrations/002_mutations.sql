-- Idempotency memo per Sync-API Spec P-5: replayed mutation_ids return
-- the recorded result without re-applying.
CREATE TABLE mutations (
    mutation_id TEXT PRIMARY KEY,
    outcome     TEXT NOT NULL,
    conflicts   TEXT,              -- JSON array of dropped fields
    seq         INTEGER NOT NULL DEFAULT 0
);
