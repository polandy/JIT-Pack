package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// cmdToken is the subcommand's name, written here and matched in main (§4a).
const cmdToken = "token"

// tokenEnv is what runTokenCreate needs from the world. Taking it as a
// parameter rather than reading it is what makes both branches of the
// stdout guard testable without a pseudo-terminal.
type tokenEnv struct {
	cfg              Config
	stdout           io.Writer
	stdoutIsTerminal bool
}

// runTokenCreate parses the flags of `jitpackd token create` and prints one
// API token (FR-23.7).
//
// It holds no rule: resolving who was meant is store.ResolveUserRef, the
// lifetime vocabulary and the signing are api.ParseAPITokenExpiry and
// api.MintAPIToken. This file is flag parsing and printing, which is what
// keeps cmd/jitpackd wiring only.
func runTokenCreate(ctx context.Context, args []string, env tokenEnv) error {
	fs := flag.NewFlagSet(cmdToken+" create", flag.ContinueOnError)
	fs.SetOutput(env.stdout)
	var (
		user        = fs.String("user", "", "the account's id or e-mail address")
		name        = fs.String("name", "", "what this token is for")
		expires     = fs.String("expires", string(api.APITokenExpiry90d), "30d, 90d, 365d or never")
		printSecret = fs.Bool("print-secret", false, "print the token even when stdout is not a terminal")
	)
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *user == "" {
		return errors.New("--user is required")
	}

	// The token goes to stdout, which is exactly where a shell history or a
	// CI log captures it. Piping it somewhere has to be a decision.
	if !env.stdoutIsTerminal && !*printSecret {
		return errors.New("stdout is not a terminal: pass --print-secret to write the token anyway")
	}
	// Single-User Mode issues no sessions and configures no secret, so there
	// is nothing to sign with — the same answer the endpoint gives.
	if env.cfg.SingleUser || env.cfg.SessionSecret == "" {
		return errors.New("API tokens need a server that signs sessions (JITPACK_SESSION_SECRET, multi-user mode)")
	}

	st, err := store.Open(env.cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer st.Close()

	userID, err := st.ResolveUserRef(ctx, *user)
	if err != nil {
		return fmt.Errorf("resolve %q: %w", *user, err)
	}

	out, err := api.MintAPIToken([]byte(env.cfg.SessionSecret),
		api.APITokenRequest{Name: *name, Expiry: api.APITokenExpiry(*expires)},
		userID, api.NewTokenID(), time.Now().UTC())
	if err != nil {
		return err
	}

	// fmt, never log: log writes to stderr with a timestamp, and is the
	// stream most likely to be redirected into a file.
	//
	// The write is checked rather than ignored, unlike an HTTP response
	// where a failure means the client is gone: here the token has already
	// been minted, cannot be listed and cannot be revoked on its own, so a
	// write that did not land leaves a live credential nobody has.
	out2 := &checkedWriter{w: env.stdout}
	out2.line(out.Token)
	if out.ExpiresAt != "" {
		out2.line("expires " + out.ExpiresAt)
	} else {
		out2.line("does not expire")
	}
	out2.line("This is the only time it is shown. It cannot be revoked on its own —")
	out2.line("rotating JITPACK_SESSION_SECRET revokes every API token at once.")
	if out2.err != nil {
		return fmt.Errorf("the token was minted but could not be written: %w", out2.err)
	}
	return nil
}

// checkedWriter keeps the first write error instead of four unchecked calls.
type checkedWriter struct {
	w   io.Writer
	err error
}

func (c *checkedWriter) line(s string) {
	if c.err != nil {
		return
	}
	_, c.err = fmt.Fprintln(c.w, s)
}

// isTerminal reports whether f is a character device. Stdlib only: a
// dependency for one Stat call would not pass the NFR-4.3 footprint test.
func isTerminal(f *os.File) bool {
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}
