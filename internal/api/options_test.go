package api

import (
	"reflect"
	"testing"
	"time"

	"jitpack/internal/store"
)

// fixedNow is the instant a configured clock must produce. Deliberately
// not "now": the assertion has to be able to tell an injected clock from
// the ambient one, which a value near real time cannot.
var fixedNow = time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)

// fullOptions names every knob at once, so a Server built from it has
// nothing left at its default.
func fullOptions() Options {
	return Options{
		Currency:    "CHF",
		PushContact: "mailto:ops@example.com",
		WSIdle:      42 * time.Millisecond,
		AdminEmails: []string{"Andy@Example.com"},
		Now:         func() time.Time { return fixedNow },
		OIDC: &OIDCConfig{
			Discovery: Discovery{
				Issuer:       "https://idp.example",
				AuthorizeURL: "https://idp.example/authorize",
				TokenURL:     "https://idp.example/token",
				UserinfoURL:  "https://idp.example/userinfo",
			},
			ClientID:     "jitpack",
			ClientSecret: "s3cret",
		},
	}
}

// applied says, per Options field, what a Server configured from
// fullOptions must look like. The map is keyed by field name so the
// count check below can prove it is exhaustive.
var applied = map[string]func(*Server) bool{
	"Currency":    func(s *Server) bool { return s.currency == "CHF" },
	"PushContact": func(s *Server) bool { return s.pushContact == "mailto:ops@example.com" },
	"WSIdle":      func(s *Server) bool { return s.wsIdle() == 42*time.Millisecond },
	// Lowercased on the way in, which is what the FR-23.1 match relies on.
	"AdminEmails": func(s *Server) bool { return s.adminEmails["andy@example.com"] },
	"Now":         func(s *Server) bool { return s.now().Equal(fixedNow) },
	"OIDC": func(s *Server) bool {
		return s.oidc != nil && s.oidc.issuer == "https://idp.example" &&
			s.oidc.clientID == "jitpack" && s.oidc.clientSecret == "s3cret" &&
			s.oidc.authorizeURL == "https://idp.example/authorize" &&
			s.oidc.tokenURL == "https://idp.example/token" &&
			s.oidc.userinfoURL == "https://idp.example/userinfo"
	},
}

func testStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

// G-13: the options replaced four post-construction setters, and the
// failure they invite is a field one constructor honours and the other
// drops — invisible, because each mode is tested through its own server.
// Both constructors must apply every field, and the count check makes an
// Options field added without an expectation here a red test rather than
// an untested knob.
func TestOptions_EveryFieldReachesBothConstructors(t *testing.T) {
	if got, want := reflect.TypeOf(Options{}).NumField(), len(applied); got != want {
		t.Fatalf("Options has %d fields, %d are asserted — add the new one to `applied`", got, want)
	}
	for _, f := range reflect.VisibleFields(reflect.TypeOf(Options{})) {
		if _, ok := applied[f.Name]; !ok {
			t.Fatalf("Options.%s has no expectation in `applied`", f.Name)
		}
	}

	servers := map[string]*Server{
		"New":           New(testStore(t), []byte("secret"), fullOptions()),
		"NewSingleUser": NewSingleUser(testStore(t), "local-user", fullOptions()),
	}
	for mode, s := range servers {
		for field, ok := range applied {
			if !ok(s) {
				t.Errorf("%s: Options.%s did not reach the Server", mode, field)
			}
		}
	}
}

// The zero Options is a complete configuration: every field's zero means
// the documented default rather than an unset server.
func TestOptions_ZeroValueKeepsTheDocumentedDefaults(t *testing.T) {
	s := New(testStore(t), []byte("secret"), Options{})

	if s.currency != "" {
		t.Errorf("currency = %q, want empty — an unnamed currency is not a default one", s.currency)
	}
	if s.oidc != nil {
		t.Error("no OIDC configured must leave the broker off (ADR-007)")
	}
	if got := s.wsIdle(); got != wsIdleTimeout {
		t.Errorf("wsIdle() = %s, want the §9 default %s", got, wsIdleTimeout)
	}
	// Never nil: every call site reads it unconditionally, so a zero
	// Options that left it unset would panic on the first push rather
	// than fall back to real time.
	if s.now == nil {
		t.Fatal("an unset clock must be real time, not nil")
	}
	if time.Since(s.now()) > time.Minute {
		t.Errorf("the default clock is not reading real time: %s", s.now())
	}
	// The allowlist is a map either way, so a lookup on an unconfigured
	// server answers false rather than panicking.
	if s.adminEmails == nil || s.adminEmails["andy@example.com"] {
		t.Error("an empty allowlist must grant no admin role (FR-23.1)")
	}
}
