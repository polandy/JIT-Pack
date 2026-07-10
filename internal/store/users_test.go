package store

import (
	"context"
	"strings"
	"testing"
)

// Sync-API §2: the first successful token exchange JIT-provisions the
// user row; later calls map the OIDC subject to the same users.id.
func TestEnsureOIDCUser_ProvisionsOnce(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id1, err := s.EnsureOIDCUser(ctx, "auth|sarah", "Sarah", "sarah@example.com", false)
	if err != nil {
		t.Fatalf("EnsureOIDCUser: %v", err)
	}
	if id1 == "" {
		t.Fatal("empty user id")
	}

	var name string
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id1).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Sarah" {
		t.Errorf("display_name = %q, want Sarah", name)
	}

	// Second call: same id, display name untouched.
	id2, err := s.EnsureOIDCUser(ctx, "auth|sarah", "Ignored", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if id2 != id1 {
		t.Errorf("second call id = %q, want %q", id2, id1)
	}
}

func TestEnsureOIDCUser_LinksExistingSubject(t *testing.T) {
	s := openTestStore(t)

	// testUser is seeded with oidc_subject 'auth|andy'.
	id, err := s.EnsureOIDCUser(context.Background(), "auth|andy", "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if id != testUser {
		t.Errorf("id = %q, want %q (existing row, FR-17.4 upgrade path)", id, testUser)
	}
}

func TestEnsureOIDCUser_FallbackDisplayName(t *testing.T) {
	s := openTestStore(t)

	long := "auth|" + strings.Repeat("x", 100)
	id, err := s.EnsureOIDCUser(context.Background(), long, "", "", false)
	if err != nil {
		t.Fatalf("EnsureOIDCUser with long subject: %v", err)
	}
	var name string
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name == "" || len(name) > 50 {
		t.Errorf("display_name = %q, want non-empty ≤50 chars (DB CHECK)", name)
	}
}
