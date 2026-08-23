package cli_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/cli"
	"jitpack/internal/store"
)

const localUser = "local-user"

// newImportServer is a real single-user instance — the mode a CLI import
// most often runs against, and the one where no token is involved.
func newImportServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	if err := st.EnsureLocalSingleUserID(context.Background(), localUser); err != nil {
		t.Fatalf("seed local user: %v", err)
	}
	srv := httptest.NewServer(api.NewSingleUser(st, localUser).Handler())
	t.Cleanup(srv.Close)
	return srv, st
}

func writeFile(t *testing.T, name, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

const templateDoc = `kind: template
name: Ferien
items:
  - name: Socken
    quantity: 3
`

const tripDoc = `kind: trip
name: Cannobio 2024
year: 2024
items:
  - name: Socken
    quantity: 3
`

func countRows(t *testing.T, st *store.Store, query string) int {
	t.Helper()
	var n int
	if err := st.DB().QueryRow(query).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

// FR-18.7: the whole point of the command — a file the user already has
// reaches the instance without a browser.
func TestRunImport_TemplateAndTrip_EachReachesItsOwnEndpoint(t *testing.T) {
	srv, st := newImportServer(t)
	path := writeFile(t, "backup.yaml", templateDoc+"---\n"+tripDoc)

	var out strings.Builder
	failed, err := cli.RunImport(context.Background(), cli.ImportOptions{ServerURL: srv.URL}, []string{path}, &out)
	if err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if failed != 0 {
		t.Fatalf("failed = %d, want 0\n%s", failed, out.String())
	}
	if got := countRows(t, st, `SELECT COUNT(*) FROM templates`); got != 1 {
		t.Errorf("templates = %d, want 1\n%s", got, out.String())
	}
	if got := countRows(t, st, `SELECT COUNT(*) FROM trips`); got != 1 {
		t.Errorf("trips = %d, want 1\n%s", got, out.String())
	}
	if !strings.Contains(out.String(), "Cannobio 2024") {
		t.Errorf("report does not name the trip it imported:\n%s", out.String())
	}
}

// FR-18.4: an unreadable document is reported in its place and the intact
// ones around it still import.
func TestRunImport_UnreadableDocument_DoesNotStopTheOnesAroundIt(t *testing.T) {
	srv, st := newImportServer(t)
	path := writeFile(t, "backup.yaml", templateDoc+"---\nkind: nonsense\nname: Broken\n---\n"+tripDoc)

	var out strings.Builder
	failed, err := cli.RunImport(context.Background(), cli.ImportOptions{ServerURL: srv.URL}, []string{path}, &out)
	if err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if failed != 1 {
		t.Errorf("failed = %d, want 1\n%s", failed, out.String())
	}
	if got := countRows(t, st, `SELECT COUNT(*) FROM templates`); got != 1 {
		t.Errorf("templates = %d, want 1", got)
	}
	if got := countRows(t, st, `SELECT COUNT(*) FROM trips`); got != 1 {
		t.Errorf("trips = %d, want 1 — the document behind the broken one was lost", got)
	}
	if !strings.Contains(out.String(), "nonsense") {
		t.Errorf("report does not say why the document was skipped:\n%s", out.String())
	}
}

// A server that refuses one document must not cost the rest of the file
// either — and the refusal has to be visible, not swallowed.
func TestRunImport_ServerRefusesOneDocument_IsReportedAndCounted(t *testing.T) {
	var seen int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen++
		if seen == 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnprocessableEntity)
			_, _ = w.Write([]byte(`{"error":{"code":"validation","message":"year out of range"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"trip_id":"abc"}`))
	}))
	defer srv.Close()
	path := writeFile(t, "backup.yaml", templateDoc+"---\n"+tripDoc)

	var out strings.Builder
	failed, err := cli.RunImport(context.Background(), cli.ImportOptions{ServerURL: srv.URL}, []string{path}, &out)
	if err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if failed != 1 {
		t.Errorf("failed = %d, want 1\n%s", failed, out.String())
	}
	if seen != 2 {
		t.Errorf("posted %d documents, want 2 — the refusal stopped the file", seen)
	}
	if !strings.Contains(out.String(), "year out of range") {
		t.Errorf("the server's reason is not in the report:\n%s", out.String())
	}
}

// A multi-user instance needs a bearer token, and it must be on every
// request — not only the first.
func TestRunImport_Token_IsSentOnEveryDocument(t *testing.T) {
	var headers []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headers = append(headers, r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	path := writeFile(t, "backup.yaml", templateDoc+"---\n"+tripDoc)

	var out strings.Builder
	if _, err := cli.RunImport(context.Background(),
		cli.ImportOptions{ServerURL: srv.URL, Token: "t0ken"}, []string{path}, &out); err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	want := []string{"Bearer t0ken", "Bearer t0ken"}
	if len(headers) != len(want) || headers[0] != want[0] || headers[1] != want[1] {
		t.Errorf("Authorization headers = %q, want %q", headers, want)
	}
}

// The kind decides the endpoint, and getting that wrong would silently file
// a trip as a template.
func TestRunImport_KindDecidesTheEndpoint(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	path := writeFile(t, "backup.yaml", tripDoc+"---\n"+templateDoc)

	var out strings.Builder
	if _, err := cli.RunImport(context.Background(),
		cli.ImportOptions{ServerURL: srv.URL}, []string{path}, &out); err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	want := []string{"/api/v1/trips/import", "/api/v1/templates/import"}
	if len(paths) != 2 || paths[0] != want[0] || paths[1] != want[1] {
		t.Errorf("endpoints = %q, want %q", paths, want)
	}
}

// --dry-run answers "would this file import?" without changing anything —
// the check the maintainer wanted after a hand-written file created a
// near-duplicate item nobody could see coming.
func TestRunImport_DryRun_ReadsTheFileAndSendsNothing(t *testing.T) {
	var posts int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		posts++
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	path := writeFile(t, "backup.yaml", templateDoc+"---\nkind: nonsense\nname: Broken\n")

	var out strings.Builder
	failed, err := cli.RunImport(context.Background(),
		cli.ImportOptions{ServerURL: srv.URL, DryRun: true}, []string{path}, &out)
	if err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if posts != 0 {
		t.Errorf("dry run posted %d documents, want 0", posts)
	}
	if failed != 1 {
		t.Errorf("failed = %d, want 1 — the unreadable document must still be reported", failed)
	}
	if !strings.Contains(out.String(), "Ferien") {
		t.Errorf("dry run did not report the readable document:\n%s", out.String())
	}
	// A dry run that summarises "1 imported" says the opposite of what it did.
	if strings.Contains(out.String(), "imported") {
		t.Errorf("dry run reports documents as imported:\n%s", out.String())
	}
	if !strings.Contains(out.String(), "1 readable, 1 unreadable") {
		t.Errorf("dry-run summary does not count what it read:\n%s", out.String())
	}
}

// The report is one line per document, and the YAML reader answers a
// multi-line list — the two have to be reconciled here or a single bad
// document scrolls the summary off the screen.
func TestRunImport_MultiLineReaderError_StaysOnOneLine(t *testing.T) {
	srv, _ := newImportServer(t)
	path := writeFile(t, "broken.yaml", "kind: template\nname: A\nitems: not-a-list\n")

	var out strings.Builder
	if _, err := cli.RunImport(context.Background(),
		cli.ImportOptions{ServerURL: srv.URL}, []string{path}, &out); err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("want a document line and a summary line, got %d:\n%s", len(lines), out.String())
	}
	if !strings.Contains(lines[0], "unreadable") {
		t.Errorf("first line is not the document report: %q", lines[0])
	}
}

// A file that is not there, or is empty, is the user's mistake — it must be
// said plainly rather than counted as a silent success.
func TestRunImport_UnusableFile_IsReportedAsAFailure(t *testing.T) {
	srv, _ := newImportServer(t)
	missing := filepath.Join(t.TempDir(), "nope.yaml")
	empty := writeFile(t, "empty.yaml", "\n")

	for _, tc := range []struct {
		name string
		path string
		want string
	}{
		{"missing file", missing, "nope.yaml"},
		{"file with no document", empty, "empty.yaml"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out strings.Builder
			failed, err := cli.RunImport(context.Background(),
				cli.ImportOptions{ServerURL: srv.URL}, []string{tc.path}, &out)
			if err != nil {
				t.Fatalf("RunImport: %v", err)
			}
			if failed != 1 {
				t.Errorf("failed = %d, want 1", failed)
			}
			if !strings.Contains(out.String(), tc.want) {
				t.Errorf("report does not name the file:\n%s", out.String())
			}
		})
	}
}

// An unreachable server is not a bad document: it must not be reported as
// one, because the file is fine and retrying it is the right advice.
func TestRunImport_ServerUnreachable_IsReportedWithTheAddress(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	addr := srv.URL
	srv.Close()
	path := writeFile(t, "one.yaml", templateDoc)

	var out strings.Builder
	failed, err := cli.RunImport(context.Background(), cli.ImportOptions{ServerURL: addr}, []string{path}, &out)
	if err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if failed != 1 {
		t.Errorf("failed = %d, want 1", failed)
	}
	if !strings.Contains(out.String(), addr) {
		t.Errorf("report does not name the server it could not reach:\n%s", out.String())
	}
}

// FR-18.5: a field this build does not model is carried, not dropped. The
// command must therefore forward the file's own bytes and never a
// re-serialization of what it understood — which would keep only the fields
// the Go type has.
func TestRunImport_UnknownField_ReachesTheServerUntouched(t *testing.T) {
	var bodies []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		bodies = append(bodies, string(raw))
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	doc := "kind: template\nname: Ferien\nfrom_a_newer_build: keep-me\nitems:\n  - name: Socken\n    quantity: 3\n"
	path := writeFile(t, "one.yaml", doc)

	var out strings.Builder
	if _, err := cli.RunImport(context.Background(),
		cli.ImportOptions{ServerURL: srv.URL}, []string{path}, &out); err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if len(bodies) != 1 {
		t.Fatalf("posted %d documents, want 1", len(bodies))
	}
	if !strings.Contains(bodies[0], "from_a_newer_build: keep-me") {
		t.Errorf("the unknown field was dropped on the way:\n%s", bodies[0])
	}
}

// Importing the same file twice is the ordinary CLI mistake; the report has
// to carry the server's reason so the user can act on it.
func TestRunImport_SameFileTwice_ReportsWhyTheSecondOneDidNotLand(t *testing.T) {
	srv, st := newImportServer(t)
	path := writeFile(t, "one.yaml", templateDoc)
	opts := cli.ImportOptions{ServerURL: srv.URL}

	var first strings.Builder
	if failed, _ := cli.RunImport(context.Background(), opts, []string{path}, &first); failed != 0 {
		t.Fatalf("first import failed:\n%s", first.String())
	}
	var second strings.Builder
	failed, err := cli.RunImport(context.Background(), opts, []string{path}, &second)
	if err != nil {
		t.Fatalf("RunImport: %v", err)
	}
	if failed != 1 {
		t.Errorf("failed = %d, want 1\n%s", failed, second.String())
	}
	if !strings.Contains(second.String(), "already exists") {
		t.Errorf("report does not say why:\n%s", second.String())
	}
	if got := countRows(t, st, `SELECT COUNT(*) FROM templates`); got != 1 {
		t.Errorf("templates = %d, want 1", got)
	}
}

func TestParseImportArgs(t *testing.T) {
	env := func(m map[string]string) func(string) string {
		return func(k string) string { return m[k] }
	}

	t.Run("flags win over the environment", func(t *testing.T) {
		opts, files, err := cli.ParseImportArgs(
			[]string{"--server", "http://flag:3000", "--token", "flag", "a.yaml"},
			env(map[string]string{"JITPACK_SERVER": "http://env:3000", "JITPACK_TOKEN": "env"}))
		if err != nil {
			t.Fatal(err)
		}
		if opts.ServerURL != "http://flag:3000" || opts.Token != "flag" {
			t.Errorf("opts = %+v", opts)
		}
		if len(files) != 1 || files[0] != "a.yaml" {
			t.Errorf("files = %q", files)
		}
	})

	t.Run("the environment supplies what the flags omit", func(t *testing.T) {
		opts, _, err := cli.ParseImportArgs([]string{"a.yaml"},
			env(map[string]string{"JITPACK_SERVER": "http://env:3000", "JITPACK_TOKEN": "env"}))
		if err != nil {
			t.Fatal(err)
		}
		if opts.ServerURL != "http://env:3000" || opts.Token != "env" {
			t.Errorf("opts = %+v", opts)
		}
	})

	t.Run("a bare invocation still knows where to look", func(t *testing.T) {
		opts, _, err := cli.ParseImportArgs([]string{"a.yaml"}, env(nil))
		if err != nil {
			t.Fatal(err)
		}
		if opts.ServerURL == "" {
			t.Error("no default server address")
		}
	})

	t.Run("no file is an error, not an empty success", func(t *testing.T) {
		if _, _, err := cli.ParseImportArgs(nil, env(nil)); err == nil {
			t.Error("want an error naming the missing argument")
		}
	})

	t.Run("an unknown flag is refused", func(t *testing.T) {
		if _, _, err := cli.ParseImportArgs([]string{"--nope", "a.yaml"}, env(nil)); err == nil {
			t.Error("want an error")
		}
	})
}
