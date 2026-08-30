package store

import (
	"context"
	"errors"
	"testing"
)

// ResolveUserRef turns what a person types on the command line into the id a
// token is minted for. It exists in the store rather than in cmd/ because it
// is a rule, and `cmd/jitpackd` is wiring only.
func TestResolveUserRef(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name, email)
		 VALUES ('u-andy', 'auth|ref-andy', 'Andy', 'Andy@Example.com')`,
		`INSERT INTO users (id, oidc_subject, display_name, email)
		 VALUES ('u-twin-a', 'auth|ref-twin-a', 'Twin A', 'twins@example.com')`,
		`INSERT INTO users (id, oidc_subject, display_name, email)
		 VALUES ('u-twin-b', 'auth|ref-twin-b', 'Twin B', 'twins@example.com')`,
	} {
		if _, err := s.db.Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}

	for _, tc := range []struct {
		name    string
		ref     string
		want    string
		wantErr error
	}{
		{"by id", "u-andy", "u-andy", nil},
		{"by e-mail", "andy@example.com", "u-andy", nil},
		{"by e-mail, ignoring case", "ANDY@EXAMPLE.COM", "u-andy", nil},
		{"an id nothing carries", "u-nobody", "", ErrUserNotFound},
		{"an e-mail nothing carries", "nobody@example.com", "", ErrUserNotFound},
		{"the empty reference", "", "", ErrUserNotFound},
		// users.email has no UNIQUE constraint, so one address can name two
		// accounts. Minting a year-long credential for whichever row came
		// first is the failure this case exists to prevent.
		{"an e-mail two accounts share", "twins@example.com", "", ErrUserRefAmbiguous},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := s.ResolveUserRef(ctx, tc.ref)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Errorf("id = %q, want %q", got, tc.want)
			}
		})
	}
}
