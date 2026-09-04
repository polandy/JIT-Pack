package store

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
)

// Addendum FR-17.2/FR-17.11: the implicit local user, its display name
// (FR-17.13), and its avatar (FR-17.13, ADR-002).

func TestEnsureLocalSingleUserID_SeedsConfiguredIDAndIsIdempotent(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// The single-user server attributes every request to the id from
	// JITPACK_LOCAL_USER_ID; that row must exist so owner_id foreign keys
	// (trips, memberships) resolve. Seeding it is what main.go calls.
	if err := s.EnsureLocalSingleUserID(ctx, "local"); err != nil {
		t.Fatalf("EnsureLocalSingleUserID: %v", err)
	}

	var (
		count   int
		isLocal int
		name    string
		oidc    sql.NullString
	)
	if err := s.db.QueryRow(
		`SELECT count(*), max(is_local_singleuser), max(display_name), max(oidc_subject)
		   FROM users WHERE id = ?`, "local").Scan(&count, &isLocal, &name, &oidc); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("rows for id=local = %d, want 1", count)
	}
	if isLocal != 1 {
		t.Errorf("is_local_singleuser = %d, want 1", isLocal)
	}
	if name != "Demo User" {
		t.Errorf("display_name = %q, want %q", name, "Demo User")
	}
	if oidc.Valid {
		t.Errorf("oidc_subject = %q, want NULL", oidc.String)
	}
	// And it is the only one. Single-User Mode attributes every request to
	// one id, so a second local row is a row nothing can ever reach.
	var locals int
	if err := s.db.QueryRow(`SELECT count(*) FROM users WHERE is_local_singleuser = 1`).Scan(&locals); err != nil {
		t.Fatal(err)
	}
	if locals != 1 {
		t.Errorf("is_local_singleuser rows = %d, want exactly 1", locals)
	}

	// Idempotent: a second call neither errors nor duplicates the row,
	// and does not overwrite a display name the user has since changed.
	if err := s.SetDisplayName(ctx, "local", "Renamed"); err != nil {
		t.Fatalf("SetDisplayName: %v", err)
	}
	if err := s.EnsureLocalSingleUserID(ctx, "local"); err != nil {
		t.Fatalf("EnsureLocalSingleUserID (second call): %v", err)
	}
	if err := s.db.QueryRow(`SELECT count(*), max(display_name) FROM users WHERE id = ?`, "local").
		Scan(&count, &name); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("rows after second call = %d, want 1", count)
	}
	if name != "Renamed" {
		t.Errorf("display_name overwritten: got %q, want %q", name, "Renamed")
	}
}

func TestSetDisplayName_AcceptsHumanNamesAndRejectsUnprintable(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// FR-17.13: 1–50 printable characters, no leading or trailing
	// whitespace. The rule must accept every name the system itself
	// produces — the seeded "Demo User" and IdP-sourced names with
	// spaces or diacritics.
	cases := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"alphanumeric ok", "Andy_Pollari-99", false},
		{"exactly 50 chars ok", strings.Repeat("a", 50), false},
		{"51 chars rejected", strings.Repeat("a", 51), true},
		{"the seeded default ok", "Demo User", false},
		{"diacritics ok", "Béatrice Müller", false},
		{"empty rejected", "", true},
		{"leading space rejected", " Andy", true},
		{"trailing space rejected", "Andy ", true},
		{"only spaces rejected", "   ", true},
		{"control character rejected", "Andy\tPollari", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := s.SetDisplayName(ctx, testUser, tc.value)
			if (err != nil) != tc.wantErr {
				t.Errorf("SetDisplayName(%q) error = %v, wantErr %v", tc.value, err, tc.wantErr)
			}
		})
	}
}

func TestSetDisplayName_PersistsValidValue(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if err := s.SetDisplayName(ctx, testUser, "New-Name.42"); err != nil {
		t.Fatalf("SetDisplayName: %v", err)
	}

	var name string
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, testUser).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "New-Name.42" {
		t.Errorf("display_name = %q, want %q", name, "New-Name.42")
	}
}

func jpegBytes(n int) []byte {
	b := bytes.Repeat([]byte{0xFF}, n)
	return b
}

func TestSetAvatar_AcceptsConformingImageAndGetAvatarReturnsIt(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	data := jpegBytes(1000)

	if err := s.SetAvatar(ctx, testUser, data); err != nil {
		t.Fatalf("SetAvatar: %v", err)
	}

	got, err := s.GetAvatar(ctx, testUser)
	if err != nil {
		t.Fatalf("GetAvatar: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Errorf("GetAvatar returned %d bytes, want %d matching bytes", len(got), len(data))
	}
}

func TestSetAvatar_RejectsOversizedImage(t *testing.T) {
	s := openTestStore(t)
	err := s.SetAvatar(context.Background(), testUser, jpegBytes(200_000))

	if !errors.Is(err, ErrAvatarTooLarge) {
		t.Errorf("err = %v, want ErrAvatarTooLarge", err)
	}
}

func TestGetAvatar_UnsetReturnsNilWithoutError(t *testing.T) {
	s := openTestStore(t)
	got, err := s.GetAvatar(context.Background(), testUser)
	if err != nil {
		t.Fatalf("GetAvatar: %v", err)
	}
	if got != nil {
		t.Errorf("got %v, want nil for a user with no avatar set", got)
	}
}

func TestSetAvatar_ReplacingOverwritesInPlace(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	first, second := jpegBytes(500), jpegBytes(700)

	if err := s.SetAvatar(ctx, testUser, first); err != nil {
		t.Fatalf("first SetAvatar: %v", err)
	}
	if err := s.SetAvatar(ctx, testUser, second); err != nil {
		t.Fatalf("second SetAvatar: %v", err)
	}

	got, err := s.GetAvatar(ctx, testUser)
	if err != nil {
		t.Fatalf("GetAvatar: %v", err)
	}
	if !bytes.Equal(got, second) {
		t.Error("GetAvatar did not return the replacement image")
	}
}
