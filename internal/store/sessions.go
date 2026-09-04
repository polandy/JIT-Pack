package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"
)

// ErrSessionNotFound reports a refresh token hash that matches no live
// session — unknown, already rotated, or expired. The API layer treats
// all three identically (401), so the store does not distinguish them.
var ErrSessionNotFound = errors.New("session not found")

// Session is one first-party refresh chain (ADR-007). The refresh token
// itself never reaches the store; only its hash does.
type Session struct {
	ID              string
	UserID          string
	IDPRefreshToken string
	ExpiresAt       time.Time
}

// CreateSession opens a refresh chain for the user after a brokered
// login. expiresAt bounds the chain absolutely until the next rotation
// slides it; now drives the opportunistic purge of expired rows — one
// purge per login is plenty at this scale, and taking the clock as a
// parameter keeps every expiry decision deterministic under test.
func (s *Store) CreateSession(ctx context.Context, userID, refreshHash, idpRefreshToken string, expiresAt, now time.Time) (string, error) {
	if err := s.PurgeExpiredSessions(ctx, now); err != nil {
		return "", err
	}
	id := newSessionID()
	var idpArg any
	if idpRefreshToken != "" {
		idpArg = idpRefreshToken
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id, refresh_hash, idp_refresh_token, expires_at) VALUES (?, ?, ?, ?, ?)`,
		id, userID, refreshHash, idpArg, expiresAt.UTC().Format(time.RFC3339)); err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return id, nil
}

// GetSessionByHash reads a live session without consuming it — the
// refresh handler peeks before its IdP round-trip so that an IdP outage
// leaves the chain untouched. Unknown and expired hashes both yield
// ErrSessionNotFound.
func (s *Store) GetSessionByHash(ctx context.Context, refreshHash string, now time.Time) (Session, error) {
	var (
		sess   Session
		expiry string
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, COALESCE(idp_refresh_token, ''), expires_at FROM sessions WHERE refresh_hash = ?`,
		refreshHash).Scan(&sess.ID, &sess.UserID, &sess.IDPRefreshToken, &expiry)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("lookup session: %w", err)
	}
	exp, err := time.Parse(time.RFC3339, expiry)
	if err != nil {
		return Session{}, fmt.Errorf("parse session expiry: %w", err)
	}
	sess.ExpiresAt = exp
	if now.After(exp) {
		return Session{}, ErrSessionNotFound
	}
	return sess, nil
}

// RotateSession atomically consumes oldHash and installs newHash,
// returning the session as it was before rotation — the caller needs
// the stored IdP refresh token for its own rotation round-trip. A hash
// that matches nothing live yields ErrSessionNotFound; single-use
// hashes are what make a replayed refresh token worthless.
func (s *Store) RotateSession(ctx context.Context, oldHash, newHash, newIDPRefreshToken string, newExpiry, now time.Time) (Session, error) {
	sess, err := s.GetSessionByHash(ctx, oldHash, now)
	if err != nil {
		return Session{}, err
	}

	var idpArg any
	if newIDPRefreshToken != "" {
		idpArg = newIDPRefreshToken
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE sessions SET refresh_hash = ?, idp_refresh_token = ?,
		        refreshed_at = ?, expires_at = ?
		 WHERE refresh_hash = ?`,
		newHash, idpArg, s.nowMillis(), newExpiry.UTC().Format(time.RFC3339), oldHash)
	if err != nil {
		return Session{}, fmt.Errorf("rotate session: %w", err)
	}
	if n, err := res.RowsAffected(); err != nil {
		return Session{}, fmt.Errorf("rotate session: %w", err)
	} else if n == 0 {
		// A concurrent rotation won the race on the same hash.
		return Session{}, ErrSessionNotFound
	}
	return sess, nil
}

// DeleteSession ends the chain for the given refresh hash. Idempotent:
// logging out twice is not an error.
func (s *Store) DeleteSession(ctx context.Context, refreshHash string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE refresh_hash = ?`, refreshHash); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// PurgeExpiredSessions removes rows whose absolute expiry has passed.
func (s *Store) PurgeExpiredSessions(ctx context.Context, now time.Time) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`,
		now.UTC().Format(time.RFC3339)); err != nil {
		return fmt.Errorf("purge sessions: %w", err)
	}
	return nil
}

func newSessionID() string {
	b := make([]byte, 16)
	rand.Read(b) // crypto/rand.Read never fails on supported platforms
	return hex.EncodeToString(b)
}
