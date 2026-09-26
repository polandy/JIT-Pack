// Package api — taskdue.go is FR-7.11's reminder: once a day, at a time the
// operator chooses, everybody a task is for hears that it is due tomorrow or
// today — and, in the same run, the same people hear about the trip's
// shopping entries due then (FR-30.10, FR-30.12). It is the one notification
// no push sets off — every other kind is a person's act (notificationrules.go) — so it has a clock of its own. The
// schedule and the recipient rule are pure functions; the loop and the
// store reads around them are the I/O. See ADR-076.
package api

import (
	"context"
	"log/slog"
	"time"

	"jitpack/internal/store"
)

// DefaultTaskReminderAt is when the reminder runs unless the operator says
// otherwise: 06:00, before the day's plans are made.
const DefaultTaskReminderAt = 6 * time.Hour

// dayLayout is a calendar day as comments.due_date stores it.
const dayLayout = "2006-01-02"

// The payload's answer to "when" (payloadDue): the two days a reminder is
// sent for. Words rather than a date, because the sentence the client
// renders is „today" or „tomorrow" and the day it is read on may be later.
const (
	dueToday    = "today"
	dueTomorrow = "tomorrow"
)

// payloadDue is the task_due payload key saying which of the two it is.
const payloadDue = "due"

// payloadEntryID names the shopping entry a shopping_due reminder is about.
const payloadEntryID = "entry_id"

// dueWord is the payload's answer for a day, and false for a day the
// reminder is not sent for.
func dueWord(day, today, tomorrow string) (string, bool) {
	switch day {
	case today:
		return dueToday, true
	case tomorrow:
		return dueTomorrow, true
	}
	return "", false
}

// reminderDue reports whether the reminder for now's day is due at all —
// whether the clock has passed the day's reminder time.
func reminderDue(now time.Time, at time.Duration) bool {
	return !now.Before(reminderTime(now, at))
}

// nextReminder is the first reminder moment strictly after now, in now's
// zone. Built from the calendar rather than by adding 24 hours, so a
// daylight-saving change moves the interval and not the time of day.
func nextReminder(now time.Time, at time.Duration) time.Time {
	today := reminderTime(now, at)
	if now.Before(today) {
		return today
	}
	y, m, d := now.Date()
	return reminderTime(time.Date(y, m, d+1, 0, 0, 0, 0, now.Location()), at)
}

// reminderTime is the day's reminder moment for the day now falls on.
func reminderTime(now time.Time, at time.Duration) time.Time {
	y, m, d := now.Date()
	h, rest := at/time.Hour, at%time.Hour
	return time.Date(y, m, d, int(h), int(rest/time.Minute), 0, 0, now.Location())
}

// planTaskDue decides who hears about which task (FR-7.11): the assignee,
// or — for a task nobody has been handed, or one whose assignee has left
// the trip — every member, because „nobody in particular" is everybody's.
//
// FR-17.3's two-member rule deliberately does not apply here: it exists so
// nobody is told about their own act, and a reminder is nobody's act —
// which is also why a Single-User instance is reminded too.
func planTaskDue(
	tasks []store.DueTask, today, tomorrow string,
	members func(tripID string) []store.MemberName,
) []plannedNotification {
	var plan []plannedNotification
	for _, task := range tasks {
		due, ok := dueWord(task.DueDate, today, tomorrow)
		if !ok {
			continue
		}
		payload := map[string]any{
			payloadTripID: task.TripID, payloadCommentID: task.ID,
			payloadItemName: truncate(task.Body, previewLen), payloadDue: due,
		}
		for _, userID := range dueRecipients(task.Assignee, members(task.TripID)) {
			plan = append(plan, plannedNotification{UserID: userID, Kind: store.NotifyTaskDue, Payload: payload})
		}
	}
	return plan
}

// dueRecipients is the one rule both reminders share: the assignee, or —
// for a job nobody has been handed, or one whose assignee has left the trip
// — every member, because „nobody in particular" is everybody's.
func dueRecipients(assignee string, onTrip []store.MemberName) []string {
	if assignee != "" && displayNameOf(onTrip, assignee) != "" {
		return []string{assignee}
	}
	out := make([]string, 0, len(onTrip))
	for _, m := range onTrip {
		out = append(out, m.UserID)
	}
	return out
}

// planShoppingDue decides who hears about which shopping entry (FR-30.10):
// planTaskDue's rule (FR-30.12) — the person handed the purchase, else every
// member of its trip. FR-17.3's two-member rule does not apply, for
// planTaskDue's reason.
func planShoppingDue(
	entries []store.DueShoppingEntry, today, tomorrow string,
	members func(tripID string) []store.MemberName,
) []plannedNotification {
	var plan []plannedNotification
	for _, entry := range entries {
		due, ok := dueWord(entry.DueDate, today, tomorrow)
		if !ok {
			continue
		}
		payload := map[string]any{
			payloadTripID: entry.TripID, payloadEntryID: entry.ID,
			payloadItemName: truncate(entry.Name, previewLen), payloadDue: due,
		}
		for _, userID := range dueRecipients(entry.Assignee, members(entry.TripID)) {
			plan = append(plan, plannedNotification{UserID: userID, Kind: store.NotifyShoppingDue, Payload: payload})
		}
	}
	return plan
}

// remindDueTasks sends the day's reminders — tasks and shopping entries — if the day's time has come and
// they have not been sent yet, and reports whether it sent them. Safe to
// call as often as the loop likes: the claim in the store is what makes it
// once a day, across restarts too — a server started after the time still
// sends that day's reminder, late rather than never.
func (s *Server) remindDueTasks(ctx context.Context, at time.Duration) bool {
	now := s.now()
	if !reminderDue(now, at) {
		return false
	}
	today := now.Format(dayLayout)
	claimed, err := s.store.ClaimTaskReminderDay(ctx, today)
	if err != nil {
		slog.Error("task reminder claim", "day", today, "error", err)
		return false
	}
	if !claimed {
		return false
	}
	y, m, d := now.Date()
	tomorrow := time.Date(y, m, d+1, 0, 0, 0, 0, now.Location()).Format(dayLayout)
	tasks, err := s.store.DueTasks(ctx, today, tomorrow)
	if err != nil {
		slog.Error("task reminder lookup", "day", today, "error", err)
		return false
	}
	entries, err := s.store.DueShoppingEntries(ctx, today, tomorrow)
	if err != nil {
		slog.Error("shopping reminder lookup", "day", today, "error", err)
		return false
	}
	byTrip := map[string][]store.MemberName{}
	members := func(tripID string) []store.MemberName {
		if list, ok := byTrip[tripID]; ok {
			return list
		}
		list, err := s.store.TripMemberNames(ctx, tripID)
		if err != nil {
			slog.Error("task reminder members", "trip", tripID, "error", err)
		}
		byTrip[tripID] = list
		return list
	}
	plan := planTaskDue(tasks, today, tomorrow, members)
	plan = append(plan, planShoppingDue(entries, today, tomorrow, members)...)
	for _, n := range plan {
		s.createAndNotify(ctx, n.UserID, n.Kind, n.Payload)
	}
	return true
}

// RunTaskReminders runs FR-7.11's daily reminder until ctx ends: at `at`
// past midnight in the server's own time zone (the zone of its clock), and
// at once on start when that time has already passed today and the day's
// reminder is still owed.
func (s *Server) RunTaskReminders(ctx context.Context, at time.Duration) {
	for {
		s.remindDueTasks(ctx, at)
		now := s.now()
		timer := time.NewTimer(nextReminder(now, at).Sub(now))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}
