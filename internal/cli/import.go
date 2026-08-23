// Package cli implements jitpackd's subcommands — everything the binary can
// do besides serving. It holds the decisions so they are testable on their
// own; cmd/jitpackd stays wiring (see CLAUDE.md, Packages).
package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"jitpack/internal/portable"
)

// Environment variables the import command falls back to when a flag is
// omitted, so a shell can be configured once instead of per invocation.
const (
	EnvServer = "JITPACK_SERVER"
	EnvToken  = "JITPACK_TOKEN"
)

// defaultServer is where a self-hosted instance usually answers; the flag
// exists because that is a guess, not a rule.
const defaultServer = "http://localhost:3000"

// importTimeout bounds one document. A trip document carries hundreds of
// positions and the server resolves each against the inventory, so this is
// generous by design.
const importTimeout = 2 * time.Minute

// ImportOptions configures RunImport.
type ImportOptions struct {
	// ServerURL is the instance's base address, without a trailing path.
	ServerURL string
	// Token is the bearer token a multi-user instance requires. Empty for a
	// single-user instance, which authenticates nobody (FR-17.2).
	Token string
	// DryRun reads and reports the documents without sending any of them.
	DryRun bool
	// HTTP overrides the client, for tests. Nil means a default one.
	HTTP *http.Client
}

// ParseImportArgs reads the import command's flags and operands. getenv
// supplies the fallbacks so the precedence — flag over environment over
// default — is decided here rather than in the caller.
func ParseImportArgs(args []string, getenv func(string) string) (ImportOptions, []string, error) {
	fs := flag.NewFlagSet("import", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	server := fs.String("server", "", "instance base URL (default $"+EnvServer+", else "+defaultServer+")")
	token := fs.String("token", "", "bearer token for a multi-user instance (default $"+EnvToken+")")
	dryRun := fs.Bool("dry-run", false, "read and report the documents without importing them")
	if err := fs.Parse(args); err != nil {
		return ImportOptions{}, nil, err
	}
	opts := ImportOptions{ServerURL: *server, Token: *token, DryRun: *dryRun}
	if opts.ServerURL == "" {
		opts.ServerURL = getenv(EnvServer)
	}
	if opts.ServerURL == "" {
		opts.ServerURL = defaultServer
	}
	if opts.Token == "" {
		opts.Token = getenv(EnvToken)
	}
	files := fs.Args()
	if len(files) == 0 {
		return ImportOptions{}, nil, errors.New("no file given")
	}
	return opts, files, nil
}

// ImportUsage is the command's help text, shown for a usage error.
const ImportUsage = `Usage: jitpackd import [flags] FILE...

Imports portable YAML (FR-18.1) into a running instance. A file may hold one
document or many; each is sent on its own, in the order the file lists it.

Flags:
  --server URL   instance base URL (default $` + EnvServer + `, else ` + defaultServer + `)
  --token TOKEN  bearer token for a multi-user instance (default $` + EnvToken + `)
  --dry-run      read and report the documents without importing them`

// Exit codes the import command answers with. They are part of its contract:
// a script has to be able to tell "nothing landed" from "some of it did", and
// both from "you invoked it wrong".
const (
	ExitOK             = 0
	ExitDocumentFailed = 1
	ExitUsage          = 2
)

// ImportCommand is the whole `jitpackd import` invocation: it reads the
// arguments, runs the import, and answers the process's exit code. It lives
// here rather than in main so the exit-code decision has somewhere to be
// tested.
func ImportCommand(ctx context.Context, args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	// These three are the last thing the process says; a failed write to the
	// stream carrying the failure has nowhere left to be reported.
	opts, files, err := ParseImportArgs(args, getenv)
	if errors.Is(err, flag.ErrHelp) {
		_, _ = fmt.Fprintln(stdout, ImportUsage)
		return ExitOK
	}
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "jitpackd import: %v\n\n%s\n", err, ImportUsage)
		return ExitUsage
	}
	failed, err := RunImport(ctx, opts, files, stdout)
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "jitpackd import: %v\n", err)
		return ExitDocumentFailed
	}
	if failed > 0 {
		return ExitDocumentFailed
	}
	return ExitOK
}

// RunImport imports every document of every file and writes one report line
// per document. It returns how many documents failed; a failure never stops
// the files or documents behind it, because a restore that gives up on the
// first bad document loses everything after it (FR-18.4).
//
// The error return is for a fault that makes the whole run meaningless — not
// for a document the server refused, which is reported and counted.
func RunImport(ctx context.Context, opts ImportOptions, files []string, w io.Writer) (int, error) {
	out := &report{w: w}
	client := opts.HTTP
	if client == nil {
		client = &http.Client{Timeout: importTimeout}
	}
	failed, total := 0, 0
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			out.printf("%s: %v\n", path, err)
			failed++
			total++
			continue
		}
		results := portable.UnmarshalAll(data)
		if len(results) == 0 {
			out.printf("%s: no document found\n", path)
			failed++
			total++
			continue
		}
		for i, result := range results {
			total++
			if !importDocument(ctx, client, opts, out, path, i+1, result) {
				failed++
			}
		}
	}
	landed, lost := "imported", "failed"
	if opts.DryRun {
		landed, lost = "readable", "unreadable"
	}
	out.printf("%s: %d %s, %d %s\n",
		plural(total, "document"), total-failed, landed, failed, lost)
	// A report nobody could write is a run with no result, whatever landed
	// server-side — so it is the one thing this returns an error for.
	return failed, out.err
}

// report is the run's output, remembering the first write failure instead of
// discarding one per line.
type report struct {
	w   io.Writer
	err error
}

// printf writes one report line, keeping the first failure instead of
// returning an error at each of a dozen call sites.
func (r *report) printf(format string, args ...any) {
	if _, err := fmt.Fprintf(r.w, format, args...); err != nil && r.err == nil {
		r.err = fmt.Errorf("write report: %w", err)
	}
}

// importDocument reports one document and returns whether it landed.
func importDocument(ctx context.Context, client *http.Client, opts ImportOptions,
	out *report, path string, number int, result portable.DocumentResult) bool {
	where := fmt.Sprintf("%s #%d", path, number)
	if result.Err != nil {
		out.printf("%s: unreadable — %s\n", where, oneLine(result.Err))
		return false
	}
	doc := result.Doc
	what := fmt.Sprintf("%s %s %q", where, doc.Kind, doc.Name)
	if opts.DryRun {
		out.printf("%s: readable (dry run, not sent)\n", what)
		return true
	}
	id, err := postDocument(ctx, client, opts, doc.Kind, result.Raw)
	if err != nil {
		out.printf("%s: failed — %s\n", what, oneLine(err))
		return false
	}
	out.printf("%s: imported (%s)\n", what, id)
	return true
}

// endpointFor names the endpoint that accepts a document of this kind. The
// server takes one document at a time (FR-19.5), which is why splitting the
// file is the command's job and not its.
func endpointFor(kind string) (string, error) {
	switch kind {
	case portable.KindTemplate:
		return "/api/v1/templates/import", nil
	case portable.KindTrip:
		return "/api/v1/trips/import", nil
	default:
		return "", fmt.Errorf("unknown kind %q", kind)
	}
}

// importResponse is the envelope both import endpoints answer with; which id
// field is set follows from the kind.
type importResponse struct {
	TemplateID string `json:"template_id"`
	TripID     string `json:"trip_id"`
	Error      struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// postDocument sends one document verbatim: the bytes the file spells, not a
// re-serialization of what this build understood of them (FR-18.5).
func postDocument(ctx context.Context, client *http.Client, opts ImportOptions, kind string, body []byte) (string, error) {
	endpoint, err := endpointFor(kind)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, opts.ServerURL+endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-yaml")
	if opts.Token != "" {
		req.Header.Set("Authorization", "Bearer "+opts.Token)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("%s unreachable: %w", opts.ServerURL, err)
	}
	defer resp.Body.Close()

	var answer importResponse
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBody))
	if readErr == nil {
		// A non-JSON body is possible in front of a proxy; the status line
		// still carries the answer, so a parse failure is not fatal here.
		_ = json.Unmarshal(raw, &answer)
	}
	if resp.StatusCode != http.StatusOK {
		if answer.Error.Message != "" {
			return "", fmt.Errorf("%s: %s", resp.Status, answer.Error.Message)
		}
		return "", errors.New(resp.Status)
	}
	if answer.TemplateID != "" {
		return answer.TemplateID, nil
	}
	if answer.TripID != "" {
		return answer.TripID, nil
	}
	return "no id returned", nil
}

// maxResponseBody caps what is read back from an import; the answer is an id
// or an error message, and anything larger is a proxy's error page.
const maxResponseBody = 1 << 16

// oneLine keeps the report one line per document: the YAML reader answers a
// multi-line list of everything wrong with a document, which is useful text
// and unusable as a column.
func oneLine(err error) string {
	return strings.Join(strings.Fields(err.Error()), " ")
}

func plural(n int, noun string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, noun)
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
