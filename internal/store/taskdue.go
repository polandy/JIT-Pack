// taskdue.go reads what FR-7.11's daily reminder needs: the
// open tasks, the open shopping entries (FR-30.10) and the excursions still
// to pack (FR-31.9) due on the days it asks about, the record of which
// day it last ran for, and FR-7.18's mark of how far the timed reminders
// have been sent.

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// taskReminderDayKey names the server_keys row holding the last day the
// FR-7.11 reminder ran for.
const taskReminderDayKey = "task_reminder_day"

// timedReminderMarkKey names the server_keys row holding the moment, as
// `YYYY-MM-DD HH:MM` on the server's clock, up to which FR-7.18's timed
// reminders have been sent.
const timedReminderMarkKey = "task_reminder_moment"

// The kinds of anchor a task's due day is a lead before (ADR-108): the day
// of the idea in idea_id (FR-29.21), or the start of the task's own trip
// (FR-13.4). The client's `ANCHOR_KIND` is the same two words.
const (
	AnchorKindIdea      = "idea"
	AnchorKindTripStart = "trip_start"
)

// DueTask is one open task due on a day the reminder asks about (FR-7.11).
type DueTask struct {
	ID       string
	TripID   string
	Body     string
	DueDate  string
	DueTime  string // FR-7.18, HH:MM; empty: no time, the daily run's alone
	Assignee string // empty: nobody's in particular, so everybody's
}

// DueTasks returns the open tasks of every trip that is not archived whose
// due day is one of days (YYYY-MM-DD), three kinds — a row's preparation
// (FR-7.3), the trip's own (FR-7.4) and a series task materialised onto it
// (FR-13.4) — in a stable order. No days, no tasks. An idea's preparation
// step (FR-29.21) is due its lead before the idea's day, and not at all
// while the idea has none or is dropped (ADR-104, ADR-108); a step whose idea is gone
// is an ordinary task again. A series task (ADR-106, ADR-108) is due its lead before
// the trip's own start_date, and not at all while the trip has none. A
// task's time comes with its day (FR-7.18); a step or a series task has
// none, its day being derived.
func (s *Store) DueTasks(ctx context.Context, days ...string) ([]DueTask, error) {
	if len(days) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(days)+5)
	args = append(args, AnchorKindIdea, AnchorKindTripStart, AnchorKindIdea, IdeaStateDropped, TripStatusArchived)
	for _, d := range days {
		args = append(args, d)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, trip_id, body, due, due_time, assignee FROM (
		   SELECT c.id, c.trip_id, c.body, COALESCE(c.assignee_user_id, '') AS assignee,
		          CASE WHEN c.anchor_kind = ? AND c.idea_id IS NOT NULL THEN '' ELSE COALESCE(c.due_time, '') END AS due_time,
		          CASE WHEN c.anchor_kind = ? AND c.anchor_lead_days IS NOT NULL THEN
		                   CASE WHEN t.start_date IS NULL THEN NULL
		                        ELSE date(t.start_date, '-' || c.anchor_lead_days || ' days') END
		               WHEN c.anchor_kind = ? AND c.anchor_lead_days IS NOT NULL AND c.idea_id IS NOT NULL THEN
		                   CASE WHEN i.state = ? THEN NULL
		                        ELSE date(i.planned_on, '-' || c.anchor_lead_days || ' days') END
		               ELSE c.due_date END AS due
		     FROM comments c JOIN trips t ON t.id = c.trip_id
		     LEFT JOIN ideas i ON i.id = c.idea_id
		    WHERE c.is_task = 1 AND c.task_state = 'open' AND t.status <> ?)
		  WHERE due IN (?`+strings.Repeat(", ?", len(days)-1)+`)
		  ORDER BY trip_id, due, id`, args...)
	if err != nil {
		return nil, fmt.Errorf("due tasks: %w", err)
	}
	defer rows.Close()

	var out []DueTask
	for rows.Next() {
		var d DueTask
		if err := rows.Scan(&d.ID, &d.TripID, &d.Body, &d.DueDate, &d.DueTime, &d.Assignee); err != nil {
			return nil, fmt.Errorf("due tasks: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DueShoppingEntry is one open shopping entry due on a day the reminder
// asks about (FR-30.10).
type DueShoppingEntry struct {
	ID       string
	TripID   string
	Name     string
	DueDate  string
	Assignee string // FR-30.12; empty: nobody's in particular, so everybody's
}

// DueShoppingEntries returns the entries not yet bought, of every trip that
// is not archived, whose due_date is one of days (YYYY-MM-DD), in a stable
// order. Only the shopping list's own entries: the packing list's buy rows
// carry no date (FR-30.10). No days, no entries.
func (s *Store) DueShoppingEntries(ctx context.Context, days ...string) ([]DueShoppingEntry, error) {
	if len(days) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(days)+1)
	args = append(args, TripStatusArchived)
	for _, d := range days {
		args = append(args, d)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT e.id, e.trip_id, e.name, e.due_date, COALESCE(e.assignee_user_id, '')
		   FROM shopping_entries e JOIN trips t ON t.id = e.trip_id
		  WHERE e.bought = 0 AND t.status <> ?
		    AND e.due_date IN (?`+strings.Repeat(", ?", len(days)-1)+`)
		  ORDER BY e.trip_id, e.due_date, e.id`, args...)
	if err != nil {
		return nil, fmt.Errorf("due shopping entries: %w", err)
	}
	defer rows.Close()

	var out []DueShoppingEntry
	for rows.Next() {
		var d DueShoppingEntry
		if err := rows.Scan(&d.ID, &d.TripID, &d.Name, &d.DueDate, &d.Assignee); err != nil {
			return nil, fmt.Errorf("due shopping entries: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DueExcursion is one excursion starting on a day the reminder asks about
// that still has something to pack (FR-31.9).
type DueExcursion struct {
	ID       string
	TripID   string
	Name     string
	StartsOn string
	// Participants are the accounts linked to its participants, sorted;
	// empty where it names nobody (everybody goes) or nobody linked.
	Participants []string
}

// DueExcursions returns the excursions of every trip that is not archived
// whose starts_on is one of days (YYYY-MM-DD) and that have at least one
// line still open, in a stable order. An excursion whose list is done is no
// reason to wake anybody. No days, no excursions.
func (s *Store) DueExcursions(ctx context.Context, days ...string) ([]DueExcursion, error) {
	if len(days) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(days)+1)
	args = append(args, TripStatusArchived)
	for _, d := range days {
		args = append(args, d)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT e.id, e.trip_id, e.name, e.starts_on,
		        COALESCE((SELECT group_concat(u, ',') FROM (
		            SELECT DISTINCT tr.linked_user_id AS u
		              FROM excursion_travelers x JOIN travelers tr ON tr.id = x.traveler_id
		             WHERE x.excursion_id = e.id AND tr.linked_user_id IS NOT NULL
		             ORDER BY u)), '')
		   FROM excursions e JOIN trips t ON t.id = e.trip_id
		  WHERE t.status <> ?
		    AND e.starts_on IN (?`+strings.Repeat(", ?", len(days)-1)+`)
		    AND EXISTS (SELECT 1 FROM excursion_items i
		                 WHERE i.excursion_id = e.id AND i.state IN ('open','partial'))
		  ORDER BY e.trip_id, e.starts_on, e.id`, args...)
	if err != nil {
		return nil, fmt.Errorf("due excursions: %w", err)
	}
	defer rows.Close()

	var out []DueExcursion
	for rows.Next() {
		var d DueExcursion
		var participants string
		if err := rows.Scan(&d.ID, &d.TripID, &d.Name, &d.StartsOn, &participants); err != nil {
			return nil, fmt.Errorf("due excursions: %w", err)
		}
		if participants != "" {
			d.Participants = strings.Split(participants, ",")
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ClaimTaskReminderDay records day as the one the reminder has run for, and
// reports whether it was not already — the one-send-per-day guarantee across
// restarts. One statement, so the check and the claim cannot be split by a
// second caller.
func (s *Store) ClaimTaskReminderDay(ctx context.Context, day string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO server_keys (name, value) VALUES (?, ?)
		 ON CONFLICT(name) DO UPDATE SET value = excluded.value
		 WHERE server_keys.value <> excluded.value`, taskReminderDayKey, day)
	if err != nil {
		return false, fmt.Errorf("claim task reminder day: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("claim task reminder day: %w", err)
	}
	return n > 0, nil
}

// AdvanceTimedReminderMark moves FR-7.18's mark forward to `to`
// (`YYYY-MM-DD HH:MM`) and returns where it stood, the window (from, to]
// the caller is now to send for. ok is false — nothing to send — when the
// mark is already there or past it (a second wake-up in the minute, a clock
// set back), and on the very first call, which only sets it: a time already
// passed when the server first counts is not owed. The read and the write
// share one transaction, so two callers cannot both claim a window.
func (s *Store) AdvanceTimedReminderMark(ctx context.Context, to string) (from string, ok bool, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", false, fmt.Errorf("advance timed reminder mark: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit
	err = tx.QueryRowContext(ctx, `SELECT value FROM server_keys WHERE name = ?`, timedReminderMarkKey).Scan(&from)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		from = ""
	case err != nil:
		return "", false, fmt.Errorf("advance timed reminder mark: %w", err)
	case from >= to:
		return from, false, nil
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO server_keys (name, value) VALUES (?, ?)
		 ON CONFLICT(name) DO UPDATE SET value = excluded.value`, timedReminderMarkKey, to); err != nil {
		return "", false, fmt.Errorf("advance timed reminder mark: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", false, fmt.Errorf("advance timed reminder mark: %w", err)
	}
	return from, from != "", nil
}
