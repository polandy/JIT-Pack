package store

import (
	"testing"
)

// SQLite's foreign_keys pragma is per connection and defaults to off. It
// used to be executed once after connecting, which holds only as long as
// that one pooled connection does: database/sql discards a connection it
// finds broken and dials a replacement, and the replacement would enforce
// nothing. Every REFERENCES clause in schema.sql rests on this.
func TestOpen_ForeignKeysSurviveANewPooledConnection(t *testing.T) {
	s := openTestStore(t)

	// Deterministic seam instead of hoping for a reconnect: with no idle
	// connections allowed, the pool closes each connection when it is
	// released, so the query below necessarily runs on a fresh one.
	s.db.SetMaxIdleConns(0)

	var on int
	if err := s.db.QueryRow(`PRAGMA foreign_keys`).Scan(&on); err != nil {
		t.Fatalf("read foreign_keys pragma: %v", err)
	}
	if on != 1 {
		t.Errorf("foreign_keys = %d on a fresh connection, want 1", on)
	}

	_, err := s.db.Exec(`INSERT INTO trip_items (id, trip_id, name) VALUES ('x', 'no-such-trip', 'Ghost')`)
	if err == nil {
		t.Fatal("a row referencing a missing trip was accepted on a fresh connection")
	}
}

func TestWithForeignKeys_AppendsToADSNThatAlreadyCarriesParameters(t *testing.T) {
	for _, tc := range []struct {
		name, dsn, want string
	}{
		{"bare path", "/tmp/jitpack.db", "/tmp/jitpack.db?" + foreignKeysPragma},
		{"existing query", "file:/tmp/jitpack.db?_txlock=immediate",
			"file:/tmp/jitpack.db?_txlock=immediate&" + foreignKeysPragma},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := withForeignKeys(tc.dsn); got != tc.want {
				t.Errorf("withForeignKeys(%q) = %q, want %q", tc.dsn, got, tc.want)
			}
		})
	}
}
