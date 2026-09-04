package store

import (
	"context"
	"database/sql"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"jitpack/internal/sync"
)

// storeClockInstant is the moment an injected clock reports. Deliberately
// far from any real run, so an assertion against it cannot pass by
// accident against the ambient clock.
var storeClockInstant = time.Date(2026, 3, 14, 15, 9, 26, 535000000, time.UTC)

func openTestStoreAt(t *testing.T, at time.Time) *Store {
	t.Helper()
	s, err := OpenForTestWith(t.TempDir(), Options{Now: func() time.Time { return at }})
	if err != nil {
		t.Fatalf("OpenForTestWith: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|andy', 'Andy')`, testUser)
	mustExec(t, s, `INSERT INTO trips (id, name, year, start_date, end_date) VALUES (?, 'Samedan 2026', 2026, '2026-07-10', '2026-07-20')`, testTrip)
	return s
}

// G-4: every timestamp this package writes comes from the store's own
// clock. Before the seam these columns could only be asserted non-empty —
// which is green whether the value is right, wrong, or a decade off.
//
// Both formats are represented on purpose. The four Go-side columns keep
// RFC3339 at second precision; the three that SQLite used to write with
// strftime('%Y-%m-%dT%H:%M:%fZ') keep milliseconds, because they order
// rows and whole seconds would tie instants that are not tied.
func TestStoreClock_EveryTimestampComesFromTheInjectedClock(t *testing.T) {
	// Written out rather than derived from timestampSeconds/timestampMillis:
	// formatting the expectation with the constant under test moves both
	// sides together, and the assertion then holds for any format at all.
	const (
		seconds = "2026-03-14T15:09:26Z"
		millis  = "2026-03-14T15:09:26.535Z"
	)

	cases := []struct {
		name  string
		want  string
		read  func(t *testing.T, s *Store) string
		setup func(t *testing.T, s *Store)
	}{
		{
			name:  "item_images.updated_at (FR-22.1)",
			want:  seconds,
			setup: func(t *testing.T, s *Store) { mustExec(t, s, `INSERT INTO items (id, name) VALUES ('it-1', 'Kamera')`) },
			read: func(t *testing.T, s *Store) string {
				if _, err := s.SetItemImage(context.Background(), "it-1", []byte("\xff\xd8\xff\xe0 jpeg")); err != nil {
					t.Fatalf("SetItemImage: %v", err)
				}
				return scanString(t, s, `SELECT updated_at FROM item_images WHERE item_id = 'it-1'`)
			},
		},
		{
			name: "trip_items.packing_now_at on a takeover (FR-5.7)",
			want: seconds,
			setup: func(t *testing.T, s *Store) {
				mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|sia', 'Sia')`, takerUser)
				mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, quantity, state, packing_now_by, packing_now_at)
				                VALUES ('item-1', ?, 'Zelt', 1, 'packing_now', ?, '2026-08-24T09:00:00Z')`, testTrip, testUser)
			},
			read: func(t *testing.T, s *Store) string {
				if _, err := s.TakeOverClaim(context.Background(), testTrip, "item-1", takerUser); err != nil {
					t.Fatalf("TakeOverClaim: %v", err)
				}
				return scanString(t, s, `SELECT packing_now_at FROM trip_items WHERE id = 'item-1'`)
			},
		},
		{
			name:  "items.retired_at on a referenced delete (FR-24.3)",
			want:  seconds,
			setup: seedReferencedItem,
			read: func(t *testing.T, s *Store) string {
				if _, err := s.DeleteMasterRow(context.Background(), testUser, TableItems, "it-1"); err != nil {
					t.Fatalf("DeleteMasterRow: %v", err)
				}
				return scanString(t, s, `SELECT `+RetiredColumn+` FROM items WHERE id = 'it-1'`)
			},
		},
		{
			name: "the backup's ExportedAt",
			want: seconds,
			read: func(t *testing.T, s *Store) string {
				export, err := s.ExportFull(context.Background(), testUser)
				if err != nil {
					t.Fatalf("ExportFull: %v", err)
				}
				return export.ExportedAt
			},
		},
		{
			name: "users.deactivated_at (FR-23.3)",
			want: millis,
			read: func(t *testing.T, s *Store) string {
				if err := s.DeactivateUser(context.Background(), testUser); err != nil {
					t.Fatalf("DeactivateUser: %v", err)
				}
				return scanString(t, s, `SELECT deactivated_at FROM users WHERE id = '`+testUser+`'`)
			},
		},
		{
			name: "notifications.read_at (FR-6.2)",
			want: millis,
			setup: func(t *testing.T, s *Store) {
				mustExec(t, s, `INSERT INTO notifications (id, user_id, kind, payload)
				                VALUES ('n-1', ?, 'comment.created', '{}')`, testUser)
			},
			read: func(t *testing.T, s *Store) string {
				if err := s.MarkNotificationRead(context.Background(), testUser, "n-1"); err != nil {
					t.Fatalf("MarkNotificationRead: %v", err)
				}
				return scanString(t, s, `SELECT read_at FROM notifications WHERE id = 'n-1'`)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStoreAt(t, storeClockInstant)
			if tc.setup != nil {
				tc.setup(t, s)
			}
			if got := tc.read(t, s); got != tc.want {
				t.Errorf("timestamp = %q, want %q — the column is not reading the store's clock", got, tc.want)
			}
		})
	}
}

// The HLC's wall component reads the same clock, so the hybrid clock and
// the RFC3339 columns cannot disagree about when now is. Asserted through
// the generator's own output rather than through a column, because that is
// where a second clock source would hide.
func TestStoreClock_TheHLCReadsTheSameClock(t *testing.T) {
	s := openTestStoreAt(t, storeClockInstant)
	millis, _, _, err := sync.Parse(s.hlc.Next())
	if err != nil {
		t.Fatalf("parse the generated HLC: %v", err)
	}
	if millis != storeClockInstant.UnixMilli() {
		t.Errorf("HLC physical component = %d, want %d — the hybrid clock is on a different clock than the columns",
			millis, storeClockInstant.UnixMilli())
	}
}

func scanString(t *testing.T, s *Store, query string) string {
	t.Helper()
	var v sql.NullString
	if err := s.db.QueryRow(query).Scan(&v); err != nil {
		t.Fatalf("query %q: %v", query, err)
	}
	if !v.Valid {
		t.Fatalf("query %q returned NULL — nothing was stamped at all", query)
	}
	return v.String
}

// The seam is only worth having if nothing walks around it. Every ambient
// clock reads `time.Now()` — a *call*; the two defaults that install the
// real clock pass `time.Now` as a value and are the only legitimate
// mentions, so the rule is exactly "no call to time.Now in these two
// packages". That distinction is what lets the guard be a rule rather than
// an allowlist.
//
// It covers internal/api as well as this package, because the clock is one
// decision spanning both and a guard in one of them would leave the other
// free to drift.
func TestStoreClock_NeitherPackageCallsTimeNowDirectly(t *testing.T) {
	for _, dir := range []string{".", filepath.Join("..", "api")} {
		for _, file := range packageFiles(t, dir) {
			parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, 0)
			if err != nil {
				t.Fatalf("parse %s: %v", file, err)
			}
			ast.Inspect(parsed, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || sel.Sel.Name != "Now" {
					return true
				}
				if pkg, ok := sel.X.(*ast.Ident); ok && pkg.Name == "time" {
					t.Errorf("%s calls time.Now() — read the injected clock (Store.now / Server.now) instead", file)
				}
				return true
			})
		}
	}
}

// packageFiles lists a package's own source, test files excluded.
// os.ReadDir rather than parser.ParseDir, which is deprecated and fails
// the lint gate.
func packageFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		files = append(files, filepath.Join(dir, e.Name()))
	}
	if len(files) == 0 {
		t.Fatalf("no source files under %s — the guard is measuring nothing", dir)
	}
	return files
}
