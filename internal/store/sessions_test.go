package store

import (
	"context"
	"errors"
	"testing"
	"time"
)

// First-party sessions (ADR-007): the row is the refresh state. The API
// layer hashes refresh tokens before they get here — the store never sees
// a replayable value. All expiry decisions take the caller's clock so the
// tests are deterministic (CODING_PRINCIPLES §2, no wall-clock races).

func sessionsFixture(t *testing.T) (*Store, context.Context, string, time.Time) {
	t.Helper()
	s := openTestStore(t)
	ctx := context.Background()
	userID, err := s.EnsureOIDCUser(ctx, "auth|sarah", "Sarah", "", false)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	return s, ctx, userID, now
}

func TestCreateSession_RotateReturnsTheSessionOnce(t *testing.T) {
	s, ctx, userID, now := sessionsFixture(t)

	if _, err := s.CreateSession(ctx, userID, "hash-1", "idp-refresh-1", now.Add(90*24*time.Hour), now); err != nil {
		t.Fatal(err)
	}

	// Rotation consumes hash-1 and installs hash-2, sliding the expiry.
	sess, err := s.RotateSession(ctx, "hash-1", "hash-2", "idp-refresh-2", now.Add(91*24*time.Hour), now)
	if err != nil {
		t.Fatal(err)
	}
	if sess.UserID != userID {
		t.Errorf("UserID = %q, want %q", sess.UserID, userID)
	}
	if sess.IdPRefreshToken != "idp-refresh-1" {
		t.Errorf("IdPRefreshToken = %q, want the pre-rotation value for the IdP round-trip", sess.IdPRefreshToken)
	}

	// The consumed hash must be dead: a replayed refresh token is the
	// attack this table exists to stop.
	if _, err := s.RotateSession(ctx, "hash-1", "hash-3", "", now.Add(time.Hour), now); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("replayed hash: err = %v, want ErrSessionNotFound", err)
	}
	// The new hash works.
	if _, err := s.RotateSession(ctx, "hash-2", "hash-3", "idp-refresh-3", now.Add(time.Hour), now); err != nil {
		t.Errorf("rotated hash rejected: %v", err)
	}
}

func TestGetSessionByHash_PeeksWithoutConsuming(t *testing.T) {
	s, ctx, userID, now := sessionsFixture(t)

	if _, err := s.CreateSession(ctx, userID, "hash-1", "idp-refresh-1", now.Add(time.Hour), now); err != nil {
		t.Fatal(err)
	}
	// The refresh handler peeks before the IdP round-trip so an outage
	// leaves the chain intact — peeking must not consume.
	for range 2 {
		sess, err := s.GetSessionByHash(ctx, "hash-1", now)
		if err != nil {
			t.Fatal(err)
		}
		if sess.UserID != userID || sess.IdPRefreshToken != "idp-refresh-1" {
			t.Errorf("peeked session = %+v", sess)
		}
	}
	if _, err := s.GetSessionByHash(ctx, "hash-unknown", now); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("unknown hash: err = %v, want ErrSessionNotFound", err)
	}
	if _, err := s.GetSessionByHash(ctx, "hash-1", now.Add(2*time.Hour)); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("expired session: err = %v, want ErrSessionNotFound", err)
	}
}

func TestRotateSession_ExpiredSessionIsGone(t *testing.T) {
	s, ctx, userID, now := sessionsFixture(t)

	if _, err := s.CreateSession(ctx, userID, "hash-1", "", now.Add(time.Hour), now); err != nil {
		t.Fatal(err)
	}
	after := now.Add(2 * time.Hour)
	if _, err := s.RotateSession(ctx, "hash-1", "hash-2", "", after.Add(time.Hour), after); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("expired session: err = %v, want ErrSessionNotFound", err)
	}
}

func TestDeleteSession_EndsTheChain(t *testing.T) {
	s, ctx, userID, now := sessionsFixture(t)

	if _, err := s.CreateSession(ctx, userID, "hash-1", "", now.Add(time.Hour), now); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteSession(ctx, "hash-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RotateSession(ctx, "hash-1", "hash-2", "", now.Add(time.Hour), now); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("deleted session: err = %v, want ErrSessionNotFound", err)
	}
	// Deleting an unknown hash is not an error — logout is idempotent.
	if err := s.DeleteSession(ctx, "hash-never-existed"); err != nil {
		t.Errorf("idempotent delete: %v", err)
	}
}

func TestPurgeExpiredSessions_LeavesLiveOnes(t *testing.T) {
	s, ctx, userID, now := sessionsFixture(t)

	if _, err := s.CreateSession(ctx, userID, "hash-live", "", now.Add(time.Hour), now); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, userID, "hash-dead", "", now.Add(-time.Hour), now); err != nil {
		t.Fatal(err)
	}
	if err := s.PurgeExpiredSessions(ctx, now); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM sessions`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("sessions after purge = %d, want 1 (only the live one)", n)
	}
}
