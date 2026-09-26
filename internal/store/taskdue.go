// Package store — taskdue.go reads what FR-7.11's daily reminder needs: the
// open tasks and the open shopping entries (FR-30.10) due on the days it
// asks about, and the record of which day it last ran for.
package store

import (
	"context"
	"fmt"
	"strings"
)

// TripStatusArchived is the lifecycle state of a finished trip (FR-9.2). A
// task on an archived trip is history, and nobody is reminded of it.
const TripStatusArchived = "archived"

// taskReminderDayKey names the server_keys row holding the last day the
// FR-7.11 reminder ran for.
const taskReminderDayKey = "task_reminder_day"

// DueTask is one open task due on a day the reminder asks about (FR-7.11).
type DueTask struct {
	ID       string
	TripID   string
	Body     string
	DueDate  string
	Assignee string // empty: nobody's in particular, so everybody's
}

// DueTasks returns the open tasks of every trip that is not archived whose
// due_date is one of days (YYYY-MM-DD), both kinds — a row's preparation
// (FR-7.3) and the trip's own (FR-7.4) — in a stable order. No days, no
// tasks.
func (s *Store) DueTasks(ctx context.Context, days ...string) ([]DueTask, error) {
	if len(days) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(days)+1)
	args = append(args, TripStatusArchived)
	for _, d := range days {
		args = append(args, d)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT c.id, c.trip_id, c.body, c.due_date, COALESCE(c.assignee_user_id, '')
		   FROM comments c JOIN trips t ON t.id = c.trip_id
		  WHERE c.is_task = 1 AND c.task_state = 'open' AND t.status <> ?
		    AND c.due_date IN (?`+strings.Repeat(", ?", len(days)-1)+`)
		  ORDER BY c.trip_id, c.due_date, c.id`, args...)
	if err != nil {
		return nil, fmt.Errorf("due tasks: %w", err)
	}
	defer rows.Close()

	var out []DueTask
	for rows.Next() {
		var d DueTask
		if err := rows.Scan(&d.ID, &d.TripID, &d.Body, &d.DueDate, &d.Assignee); err != nil {
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
