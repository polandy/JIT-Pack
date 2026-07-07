package store

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
)

// Addendum FR-17.2/FR-17.11: the implicit local user, its display name
// (FR-17.13), and its avatar (FR-17.13, ADR-002).

func TestEnsureLocalSingleUser_CreatesExactlyOneRowAndIsIdempotent(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id1, err := s.EnsureLocalSingleUser(ctx)
	if err != nil {
		t.Fatalf("EnsureLocalSingleUser: %v", err)
	}
	if id1 == "" {
		t.Fatal("got empty id")
	}

	id2, err := s.EnsureLocalSingleUser(ctx)
	if err != nil {
		t.Fatalf("EnsureLocalSingleUser (second call): %v", err)
	}
	if id1 != id2 {
		t.Errorf("second call returned a different id: %q vs %q", id1, id2)
	}

	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM users WHERE is_local_singleuser = 1`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("is_local_singleuser rows = %d, want exactly 1", count)
	}
}

func TestEnsureLocalSingleUser_DefaultsDisplayNameToDemoUser(t *testing.T) {
	s := openTestStore(t)
	id, err := s.EnsureLocalSingleUser(context.Background())
	if err != nil {
		t.Fatalf("EnsureLocalSingleUser: %v", err)
	}

	var name string
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Demo User" {
		t.Errorf("display_name = %q, want %q", name, "Demo User")
	}
}

func TestSetDisplayName_ValidatesCharsetAndLength(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	cases := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"alphanumeric ok", "Andy_Pollari-99", false},
		{"exactly 50 chars ok", strings.Repeat("a", 50), false},
		{"51 chars rejected", strings.Repeat("a", 51), true},
		{"space rejected", "Andy Pollari", true},
		{"empty rejected", "", true},
		{"unicode rejected", "Andyé", true},
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
