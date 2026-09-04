package store

import (
	"context"
	"errors"
	"io"
	"testing"
)

// G-14: the decision "is this the client's data or this server?" is read
// from SQLite's result code, not from the driver's message. The message is
// not part of any contract; the result codes are.
//
// Both directions matter and only one of them was covered. A constraint
// failure missed leaves a rejected mutation reported as a server error; a
// *non*-constraint failure matched leaves a disk error or a locked database
// reported to the user as their own bad data — `conflicts.go` turns this
// answer into ErrRevertRefused ("the merge rules refuse this revert") and
// `partition.go` into a rejected mutation, so the real fault would vanish
// behind a sentence about the user's row.
func TestIsConstraintViolation_ReadsTheResultCodeNotTheMessage(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// Each of the three constraint kinds carries its own *extended* code
	// (SQLITE_CONSTRAINT_FOREIGNKEY 787, _CHECK 275, _UNIQUE 2067), none of
	// which equals SQLITE_CONSTRAINT itself — which is why the primary code
	// is masked out rather than compared whole.
	constraints := []struct {
		name string
		exec string
		args []any
	}{
		{
			name: "foreign key: a trip item on a trip that does not exist",
			exec: `INSERT INTO trip_items (id, trip_id, name, quantity) VALUES ('ti-x', 'no-such-trip', 'Zelt', 1)`,
		},
		{
			name: "unique: the same id twice",
			exec: `INSERT INTO items (id, name) VALUES (?, 'Kamera')`,
			args: []any{"it-dup"},
		},
		{
			name: "check: an item image that is not a JPEG",
			exec: `INSERT INTO item_images (item_id, image, mime) VALUES ('it-dup', x'00', 'image/png')`,
		},
	}
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('it-dup', 'Kamera')`)

	for _, tc := range constraints {
		t.Run(tc.name, func(t *testing.T) {
			_, err := s.db.ExecContext(ctx, tc.exec, tc.args...)
			if err == nil {
				t.Fatal("the statement was accepted — this case no longer provokes a constraint failure")
			}
			if !isConstraintViolation(err) {
				t.Errorf("not recognised as a constraint failure: %v", err)
			}
		})
	}

	notTheClientsFault := []struct {
		name string
		err  error
	}{
		{"no error at all", nil},
		{"an error the driver never produced", io.ErrUnexpectedEOF},
		{"a cancelled context", context.Canceled},
	}
	for _, tc := range notTheClientsFault {
		t.Run(tc.name, func(t *testing.T) {
			if isConstraintViolation(tc.err) {
				t.Errorf("%v was reported as the client's data being at fault", tc.err)
			}
		})
	}

	// A driver error that is not a constraint: SQLITE_ERROR. Provoked rather
	// than constructed, because *sqlite.Error's fields are unexported and a
	// hand-built stand-in would assert against the test's idea of the driver.
	t.Run("a driver error that is not a constraint", func(t *testing.T) {
		_, err := s.db.ExecContext(ctx, `INSERT INTO no_such_table (id) VALUES ('x')`)
		if err == nil {
			t.Fatal("the statement was accepted")
		}
		if isConstraintViolation(err) {
			t.Errorf("a malformed statement was reported as the client's data being at fault: %v", err)
		}
	})

	// The old implementation matched the message "constraint failed". A row
	// whose *content* says that must not be mistaken for one: this is the
	// exact failure the result code exists to prevent.
	t.Run("a row that merely says the words", func(t *testing.T) {
		if err := errors.New(`INSERT failed: constraint failed`); isConstraintViolation(err) {
			t.Error("an error was matched by its wording rather than by its result code")
		}
	})
}
