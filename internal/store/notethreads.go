package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"jitpack/internal/sync"
)

// FR-7.13's columns on comments, named once for the rule below.
const (
	columnParentID = "parent_id"
	columnTitle    = "title"
	columnEditedAt = "edited_at"
	columnBody     = "body"
	columnAuthorID = "author_id"
	columnIsTask   = "is_task"
	columnItemID   = "trip_item_id"
)

// noteWords are the fields an edit of a note changes — the ones only the
// entry's author may send (FR-7.13 question 2: an entry carries its
// author's name, and words changed by somebody else would still be signed
// by them).
var noteWords = []string{columnBody, columnTitle, columnEditedAt}

// validNoteThread is FR-7.13's part of the trip partition's write gate: a
// thread is one level deep, a reply names its thread once and carries no
// title, and a note's words are its author's. The first two are rules over
// another row, which a CHECK cannot see; the third is a rule over who is
// pushing, which the schema does not know.
//
// It may strip fields it owns (parent_id on every later op, title on a
// reply), which is why it takes the mutation by pointer.
func validNoteThread(ctx context.Context, tx *sql.Tx, tripID, actorID string, row sync.Row, m *sync.Mutation) (RejectReason, error) {
	if m.Op == sync.OpDelete {
		return ReasonNone, nil
	}
	if row.Exists {
		// Written once, like author_id: a reply moved to another thread
		// makes a conflict nobody could read.
		delete(m.Fields, columnParentID)
		if parent, _ := row.Fields[columnParentID].(string); parent != "" {
			delete(m.Fields, columnTitle)
			if sync.IsTruthy(m.Fields[columnIsTask]) {
				return ReasonConstraintViolated, nil
			}
		}
		if isNoteRow(row.Fields) && touchesAny(m.Fields, noteWords) {
			if author, _ := row.Fields[columnAuthorID].(string); author != actorID {
				return ReasonNotAuthorized, nil
			}
		}
		return ReasonNone, nil
	}

	parent, _ := m.Fields[columnParentID].(string)
	if parent == "" {
		return ReasonNone, nil
	}
	delete(m.Fields, columnTitle)
	if !isNoteRow(m.Fields) {
		return ReasonConstraintViolated, nil
	}
	return firstNoteOf(ctx, tx, tripID, parent)
}

// firstNoteOf answers whether id is a first note of tripID — a trip-level,
// non-task comment that is not itself a reply — which is the only row a
// reply may name.
func firstNoteOf(ctx context.Context, tx *sql.Tx, tripID, id string) (RejectReason, error) {
	var parentTrip string
	var itemID, parentOfParent sql.NullString
	var isTask int
	err := tx.QueryRowContext(ctx,
		`SELECT trip_id, trip_item_id, is_task, parent_id FROM comments WHERE id = ?`, id).
		Scan(&parentTrip, &itemID, &isTask, &parentOfParent)
	if errors.Is(err, sql.ErrNoRows) {
		return ReasonConstraintViolated, nil
	}
	if err != nil {
		return ReasonNone, fmt.Errorf("note thread parent lookup: %w", err)
	}
	if parentTrip != tripID || itemID.Valid || isTask != 0 || parentOfParent.Valid {
		return ReasonConstraintViolated, nil
	}
	return ReasonNone, nil
}

// isNoteRow reports whether fields describe FR-7.9's note shape: no packing
// row, not a task.
func isNoteRow(fields map[string]any) bool {
	itemID, _ := fields[columnItemID].(string)
	return itemID == "" && !sync.IsTruthy(fields[columnIsTask])
}

func touchesAny(fields map[string]any, names []string) bool {
	for _, name := range names {
		if _, ok := fields[name]; ok {
			return true
		}
	}
	return false
}

// NoteThread is what FR-7.13's reply notification needs to know about one
// thread.
type NoteThread struct {
	// Title is the first note's title, empty when it has none.
	Title string
	// Body is the first note's words.
	Body string
	// Participants are the first note's author, then every replier in the
	// order they first replied, each once.
	Participants []string
}

// NoteThread reads the thread whose first note is rootID. A tick does not
// make a participant (FR-7.13 question 4), so note_acks is not read.
func (s *Store) NoteThread(ctx context.Context, rootID string) (NoteThread, error) {
	var thread NoteThread
	var title sql.NullString
	var author string
	err := s.db.QueryRowContext(ctx,
		`SELECT coalesce(title, ''), body, author_id FROM comments WHERE id = ?`, rootID).
		Scan(&title, &thread.Body, &author)
	if err != nil {
		return NoteThread{}, fmt.Errorf("note thread %s: %w", rootID, err)
	}
	thread.Title = title.String
	thread.Participants = []string{author}

	rows, err := s.db.QueryContext(ctx,
		`SELECT author_id FROM comments WHERE parent_id = ?
		 GROUP BY author_id ORDER BY min(created_at), min(rowid)`, rootID)
	if err != nil {
		return NoteThread{}, fmt.Errorf("note thread %s repliers: %w", rootID, err)
	}
	defer rows.Close()
	for rows.Next() {
		var replier string
		if err := rows.Scan(&replier); err != nil {
			return NoteThread{}, fmt.Errorf("scan replier: %w", err)
		}
		if replier != author {
			thread.Participants = append(thread.Participants, replier)
		}
	}
	return thread, rows.Err()
}
