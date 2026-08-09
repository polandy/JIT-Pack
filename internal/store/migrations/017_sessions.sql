-- 017: First-party sessions (ADR-007, Sync-API §2)
--
-- The login broker exchanges the OIDC code, validates the ID token, reads
-- identity from UserInfo, and then issues JIT-Pack's own tokens: a stateless
-- HS256 access token plus a refresh token whose only server-side trace is
-- this row. Storing a hash rather than the token means a leaked database
-- yields nothing replayable; storing the IdP refresh token lets each refresh
-- re-validate the account against the IdP (logout/deactivation propagates at
-- refresh cadence, not at token lifetime).
-- Rows never sync: sessions are server-local, like the users columns in 010.
CREATE TABLE sessions (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id),
    refresh_hash      TEXT NOT NULL UNIQUE,
    idp_refresh_token TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    refreshed_at      TEXT,
    expires_at        TEXT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
