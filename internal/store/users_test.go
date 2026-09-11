package store

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"
)

// Sync-API §2: the first successful token exchange JIT-provisions the
// user row; later calls map the OIDC subject to the same users.id.
func TestEnsureOIDCUser_ProvisionsOnce(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id1, err := s.EnsureOIDCUser(ctx, "auth|sarah", "Sarah", "sarah@example.com", adminRole(false))
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
	id2, err := s.EnsureOIDCUser(ctx, "auth|sarah", "Ignored", "", adminRole(false))
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
	id, err := s.EnsureOIDCUser(context.Background(), "auth|andy", "", "", adminRole(false))
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
	id, err := s.EnsureOIDCUser(context.Background(), long, "", "", adminRole(false))
	if err != nil {
		t.Fatalf("EnsureOIDCUser with long subject: %v", err)
	}
	var name string
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name == "" || utf8.RuneCountInString(name) > maxDisplayNameChars {
		t.Errorf("display_name = %q, want non-empty ≤%d chars (DB CHECK)", name, maxDisplayNameChars)
	}
}

// The IdP's name is *sanitised*, never refused: a login must not fail over a
// display name, and FR-17.13 is the rule the other two writers of this column
// already apply — SetDisplayName here and the client before it.
func TestEnsureOIDCUser_SanitisesTheNameTheIdPSent(t *testing.T) {
	cases := []struct {
		name    string
		subject string
		claim   string
		want    string
	}{
		{
			// The CHECK counts characters, so a byte cut both truncated a
			// name of multi-byte runes to half its allowance and could leave
			// half a rune in the column.
			name:    "a long name is cut on a rune boundary, not a byte",
			subject: "auth|cyrillic",
			claim:   strings.Repeat("щ", 60),
			want:    strings.Repeat("щ", maxDisplayNameChars),
		},
		{
			name:    "a name of exactly the allowance is kept whole",
			subject: "auth|exact",
			claim:   strings.Repeat("ü", maxDisplayNameChars),
			want:    strings.Repeat("ü", maxDisplayNameChars),
		},
		{
			name:    "edge whitespace goes, like FR-17.13 says",
			subject: "auth|spaced",
			claim:   "  Andy Pollari\t",
			want:    "Andy Pollari",
		},
		{
			name:    "a control character never reaches the column",
			subject: "auth|control",
			claim:   "Andy\u0000Pollari",
			want:    "AndyPollari",
		},
		{
			// A claim that sanitises away is the same case as an absent one.
			name:    "a name that is nothing but whitespace falls back to the subject",
			subject: "auth|blank",
			claim:   "   ",
			want:    "auth|blank",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStore(t)
			id, err := s.EnsureOIDCUser(context.Background(), tc.subject, tc.claim, "", adminRole(false))
			if err != nil {
				t.Fatalf("EnsureOIDCUser: %v", err)
			}
			var name string
			if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
				t.Fatal(err)
			}
			if name != tc.want {
				t.Errorf("display_name = %q, want %q", name, tc.want)
			}
			if !utf8.ValidString(name) {
				t.Errorf("display_name = %q is not valid UTF-8", name)
			}
			// What the IdP path writes must be a name the *other* writer of
			// this column would have accepted — otherwise M17 shows a name
			// it refuses to save back.
			if !displayNamePattern.MatchString(name) {
				t.Errorf("display_name = %q fails the FR-17.13 rule SetDisplayName enforces", name)
			}
		})
	}
}
