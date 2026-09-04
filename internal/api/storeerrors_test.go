package api

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jitpack/internal/store"
)

// storeSentinelsWithoutAnHTTPAnswer are the exported store errors that
// deliberately never become a status, each with the reason. A sentinel
// that is in neither this list nor storeErrorResponses would answer with
// whichever fallback sentence the handler that met it happens to carry —
// "revert failed" for a missing user — which is why the guard below
// insists every one of them is accounted for by name.
var storeSentinelsWithoutAnHTTPAnswer = map[string]string{
	"ErrUnknownTable":     "a push refuses the single mutation, not the request: it becomes a rejected MutationResult in the envelope (Sync-API §5)",
	"ErrUnknownColumn":    "same as ErrUnknownTable — per-mutation rejection, not a status",
	"ErrUserRefAmbiguous": "resolved by the CLI (FR-18.8), which prints it; no handler can produce it",
	"ErrSchemaStale":      "start-up refusal in cmd/jitpackd (ADR-018); the server never starts, so there is nothing to answer with",
}

// storeErrorNames maps the table's rows back to the identifiers the guard
// reads out of the store package, because an error value cannot name
// itself.
func storeErrorNames(t *testing.T) map[error]string {
	t.Helper()
	return map[error]string{
		store.ErrUserNotFound:            "ErrUserNotFound",
		store.ErrAdminUndeactivatable:    "ErrAdminUndeactivatable",
		store.ErrSessionNotFound:         "ErrSessionNotFound",
		store.ErrNotificationNotFound:    "ErrNotificationNotFound",
		store.ErrConflictNotFound:        "ErrConflictNotFound",
		store.ErrConflictAlreadyReverted: "ErrConflictAlreadyReverted",
		store.ErrConflictRowGone:         "ErrConflictRowGone",
		store.ErrRevertRefused:           "ErrRevertRefused",
		store.ErrRevertForbidden:         "ErrRevertForbidden",
		store.ErrTripItemNotFound:        "ErrTripItemNotFound",
		store.ErrClaimNotHeld:            "ErrClaimNotHeld",
		store.ErrClaimIsOwn:              "ErrClaimIsOwn",
		store.ErrMasterRowNotFound:       "ErrMasterRowNotFound",
		store.ErrMasterTableNotDeletable: "ErrMasterTableNotDeletable",
		store.ErrItemNotFound:            "ErrItemNotFound",
		store.ErrItemImageTooLarge:       "ErrItemImageTooLarge",
		store.ErrAvatarTooLarge:          "ErrAvatarTooLarge",
		store.ErrInvalidDisplayName:      "ErrInvalidDisplayName",
	}
}

// Every exported sentinel the store can return is either answered by the
// table or listed as one that never becomes a status. Go cannot enumerate
// another package's variables at runtime, so the guard reads the
// declarations — which is the point: a sentinel added next month is caught
// by this test rather than by a user meeting the wrong sentence.
func TestStoreErrorResponses_AccountForEveryStoreSentinel(t *testing.T) {
	declared := exportedSentinelNames(t, filepath.Join("..", "store"))
	if len(declared) == 0 {
		t.Fatalf("read no sentinels out of internal/store — the guard is measuring nothing")
	}

	answered := map[string]bool{}
	names := storeErrorNames(t)
	for _, row := range storeErrorResponses {
		name, ok := names[row.err]
		if !ok {
			t.Fatalf("a row of storeErrorResponses is not named in storeErrorNames: %v", row.err)
		}
		answered[name] = true
	}

	for _, name := range declared {
		_, excused := storeSentinelsWithoutAnHTTPAnswer[name]
		switch {
		case answered[name] && excused:
			t.Errorf("store.%s is both answered by the table and listed as having no answer", name)
		case !answered[name] && !excused:
			t.Errorf("store.%s has no row in storeErrorResponses and no reason in storeSentinelsWithoutAnHTTPAnswer", name)
		}
	}
	for name := range storeSentinelsWithoutAnHTTPAnswer {
		if !contains(declared, name) {
			t.Errorf("storeSentinelsWithoutAnHTTPAnswer names store.%s, which the store no longer declares", name)
		}
	}
}

// The answers themselves: a status the client's vocabulary can act on, and
// never a 500 for something the caller did. The three rows with no message
// answer with the store's own sentence, which is where the size limits are
// written.
func TestWriteStoreError_AnswersEveryRowOnPurpose(t *testing.T) {
	names := storeErrorNames(t)
	for _, row := range storeErrorResponses {
		t.Run(names[row.err], func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeStoreError(rec, fmt.Errorf("wrapped: %w", row.err), "the fallback must not be reached")
			if rec.Code != row.status {
				t.Fatalf("status = %d, want %d", rec.Code, row.status)
			}
			body := rec.Body.String()
			if strings.Contains(body, "the fallback must not be reached") {
				t.Fatalf("a listed sentinel fell through to the fallback: %s", body)
			}
			if !strings.Contains(body, string(row.code)) {
				t.Fatalf("body does not carry the error code %q: %s", row.code, body)
			}
			if row.msg == "" && !strings.Contains(body, row.err.Error()) {
				t.Fatalf("a row with no message must answer with the sentinel's own sentence: %s", body)
			}
		})
	}
}

// The three limits answer with the store's own sentence, so the number a
// user is told is the number the store enforces. A literal here would be a
// second copy nothing keeps in step; this is what says the empty message is
// deliberate rather than forgotten — and what stops the next row from
// inheriting the blank by accident.
func TestStoreErrorResponses_OnlyTheLimitsAnswerWithTheStoresOwnSentence(t *testing.T) {
	fromTheStore := map[error]bool{
		store.ErrItemImageTooLarge:  true,
		store.ErrAvatarTooLarge:     true,
		store.ErrInvalidDisplayName: true,
	}
	names := storeErrorNames(t)
	for _, row := range storeErrorResponses {
		switch {
		case fromTheStore[row.err] && row.msg != "":
			t.Errorf("store.%s must answer with the store's own sentence, got %q", names[row.err], row.msg)
		case !fromTheStore[row.err] && row.msg == "":
			t.Errorf("store.%s has no message: only the three limits may borrow the store's sentence", names[row.err])
		}
	}
}

// An error the table does not know is not the caller's fault, and each
// handler says so in its own words — the reason the fallback is a
// parameter rather than one sentence for eight endpoints.
func TestWriteStoreError_UnknownErrorTakesTheHandlersOwnSentence(t *testing.T) {
	rec := httptest.NewRecorder()
	writeStoreError(rec, errors.New("the disk melted"), "revert failed")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "revert failed") {
		t.Fatalf("body does not carry the handler's fallback: %s", rec.Body.String())
	}
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// exportedSentinelNames reads the exported `errors.New` variables out of
// every non-test file in a package directory. os.ReadDir rather than
// parser.ParseDir, which is deprecated and fails the lint gate.
func exportedSentinelNames(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), filepath.Join(dir, e.Name()), nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", e.Name(), err)
		}
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.VAR {
				continue
			}
			for _, spec := range gen.Specs {
				value, ok := spec.(*ast.ValueSpec)
				if !ok {
					continue
				}
				for i, name := range value.Names {
					if i < len(value.Values) && isErrorsNew(value.Values[i]) && ast.IsExported(name.Name) {
						names = append(names, name.Name)
					}
				}
			}
		}
	}
	return names
}
