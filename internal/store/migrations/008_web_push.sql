-- 008: Web Push (NFR-4.6).
-- One row per browser push registration; endpoint is the identity —
-- re-registering an endpoint (e.g. after a user switch on the device)
-- rebinds it instead of duplicating.
CREATE TABLE push_subscriptions (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id    TEXT NOT NULL REFERENCES users(id),
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);

-- Self-generated server secrets (the VAPID keypair): NFR-4.6 forbids
-- mandatory third-party services, so the keys are generated on first
-- use and stored next to the data they serve — keeps the single-file
-- backup story of ADR-001 intact.
CREATE TABLE server_keys (
    name  TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
