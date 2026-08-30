package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jitpack/internal/store"
)

// multiUserConfig is a server that signs sessions, with its own database.
func multiUserConfig(t *testing.T) Config {
	t.Helper()
	return Config{
		DBPath:        filepath.Join(t.TempDir(), "jitpack.db"),
		SessionSecret: "a-test-signing-secret",
	}
}

// seedUser opens the database the config names and puts one account in it.
func seedUser(t *testing.T, cfg Config, id, email string) {
	t.Helper()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer st.Close()
	if _, err := st.DB().Exec(
		`INSERT INTO users (id, oidc_subject, display_name, email) VALUES (?, ?, ?, ?)`,
		id, "auth|"+id, "Test", email); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func TestRunTokenCreate_PrintsATokenAndWhatItCannotDo(t *testing.T) {
	cfg := multiUserConfig(t)
	seedUser(t, cfg, "u-andy", "andy@example.com")

	var out bytes.Buffer
	err := runTokenCreate(context.Background(),
		[]string{"--user", "andy@example.com", "--name", "cleanup"},
		tokenEnv{cfg: cfg, stdout: &out, stdoutIsTerminal: true})
	if err != nil {
		t.Fatalf("runTokenCreate: %v", err)
	}

	printed := out.String()
	// Three dot-separated segments: it is a JWT.
	first, _, _ := strings.Cut(printed, "\n")
	if strings.Count(first, ".") != 2 {
		t.Errorf("first line %q is not a JWT", first)
	}
	// The two things nothing else will tell the person.
	if !strings.Contains(printed, "only time it is shown") {
		t.Error("the output does not say the token will not be shown again")
	}
	if !strings.Contains(printed, "JITPACK_SESSION_SECRET") {
		t.Error("the output does not say how to revoke it")
	}
}

// The token goes to stdout, which is where a shell history or a CI log
// captures it. Redirecting it has to be a decision, so the refusal and the
// override are both asserted — an override nobody can reach is not a control.
func TestRunTokenCreate_RefusesToWriteASecretIntoAPipe(t *testing.T) {
	cfg := multiUserConfig(t)
	seedUser(t, cfg, "u-andy", "andy@example.com")
	args := []string{"--user", "u-andy", "--name", "cleanup"}

	var out bytes.Buffer
	err := runTokenCreate(context.Background(), args,
		tokenEnv{cfg: cfg, stdout: &out, stdoutIsTerminal: false})
	if err == nil {
		t.Fatal("a token was written to a non-terminal without --print-secret")
	}
	if out.Len() != 0 {
		t.Errorf("something was printed anyway: %q", out.String())
	}

	out.Reset()
	if err := runTokenCreate(context.Background(), append(args, "--print-secret"),
		tokenEnv{cfg: cfg, stdout: &out, stdoutIsTerminal: false}); err != nil {
		t.Fatalf("--print-secret must lift the refusal: %v", err)
	}
	if out.Len() == 0 {
		t.Error("--print-secret printed nothing")
	}
}

func TestRunTokenCreate_Refusals(t *testing.T) {
	cfg := multiUserConfig(t)
	seedUser(t, cfg, "u-andy", "andy@example.com")

	for _, tc := range []struct {
		name string
		cfg  Config
		args []string
		want string
	}{
		{"no --user", cfg, []string{"--name", "n"}, "--user is required"},
		{"an account nothing carries", cfg, []string{"--user", "nobody@example.com"}, "not found"},
		{"an expiry outside the vocabulary", cfg,
			[]string{"--user", "u-andy", "--name", "n", "--expires", "decade"}, "expiry"},
		{"an empty name", cfg, []string{"--user", "u-andy"}, "name is required"},
		{"single-user mode signs nothing",
			Config{DBPath: cfg.DBPath, SingleUser: true, LocalUserID: "local"},
			[]string{"--user", "u-andy", "--name", "n"}, "signs sessions"},
		{"no session secret configured",
			Config{DBPath: cfg.DBPath},
			[]string{"--user", "u-andy", "--name", "n"}, "signs sessions"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			err := runTokenCreate(context.Background(), tc.args,
				tokenEnv{cfg: tc.cfg, stdout: &out, stdoutIsTerminal: true})
			if err == nil {
				t.Fatalf("accepted, printing %q", out.String())
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want it to mention %q", err, tc.want)
			}
		})
	}
}

// A buffer is not a character device, and neither is a pipe; the guard has to
// agree with the operating system rather than with an assumption.
func TestIsTerminal_APipeIsNotOne(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	defer r.Close()
	defer w.Close()
	if isTerminal(w) {
		t.Error("a pipe reported as a terminal — the secret guard would never fire")
	}
}
