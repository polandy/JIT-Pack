package notify

// FR-7.18's timed reminder: a task whose due day carries a time is reminded
// at that time on that day, in place of the daily run's „today". The run
// keeps one mark — the last minute it has looked at — and each wake-up
// sends what fell due between the mark and now, so a reminder goes out once,
// late rather than never after a downtime, again when its time is moved
// later, and not at all when it is set to a time already gone. See ADR-105.

import (
	"context"
	"log/slog"
	"time"

	"jitpack/internal/store"
)

// momentLayout is a minute on the server's clock as the timed run's mark
// stores it; it sorts as text in time order.
const momentLayout = dayLayout + " 15:04"

// dueNow is the payload's answer to "when" for a timed reminder: the
// task's time is now.
const dueNow = "now"

// payloadTime is the task's time of day, HH:MM, on a task_due whose task
// has one.
const payloadTime = "time"

// nextTick is the next whole minute after now.
func nextTick(now time.Time) time.Time {
	return now.Truncate(time.Minute).Add(time.Minute)
}

// planTimedTaskDue decides who hears about which timed task (FR-7.18): those
// due today whose moment lies in (from, to], to planTaskDue's recipients.
// from is never earlier than today's start, so a run after a downtime over
// midnight does not send a past day's time on the wrong day.
func planTimedTaskDue(
	tasks []store.DueTask, today, from, to string,
	members func(tripID string) []store.MemberName,
) []plannedNotification {
	if dayStart := today + " "; from < dayStart {
		from = dayStart
	}
	var plan []plannedNotification
	for _, task := range tasks {
		if task.DueDate != today || task.DueTime == "" {
			continue
		}
		moment := today + " " + task.DueTime
		if moment <= from || moment > to {
			continue
		}
		payload := map[string]any{
			payloadTripID: task.TripID, payloadCommentID: task.ID,
			payloadItemName: truncate(task.Body, previewLen), payloadDue: dueNow,
			payloadTime: task.DueTime,
		}
		for _, userID := range dueRecipients(task.Assignee, members(task.TripID)) {
			plan = append(plan, plannedNotification{UserID: userID, Kind: store.NotifyTaskDue, Payload: payload})
		}
	}
	return plan
}

// remindTimed sends the timed reminders that fell due since the last run,
// and reports whether it sent any. The first run ever only sets the mark: a
// server new to the feature has no window to look back over.
func (n *Notifier) remindTimed(ctx context.Context) bool {
	now := n.now()
	to := now.Format(momentLayout)
	from, ok, err := n.store.AdvanceTimedReminderMark(ctx, to)
	if err != nil {
		slog.Error("timed reminder mark", "moment", to, "error", err)
		return false
	}
	if !ok {
		return false
	}
	today := now.Format(dayLayout)
	tasks, err := n.store.DueTasks(ctx, today)
	if err != nil {
		slog.Error("timed reminder lookup", "day", today, "error", err)
		return false
	}
	plan := planTimedTaskDue(tasks, today, from, to, n.tripMembers(ctx))
	n.deliver(ctx, plan)
	return len(plan) > 0
}
