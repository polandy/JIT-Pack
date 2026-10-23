package notify

import (
	"context"
	"reflect"
	"testing"
	"time"

	"jitpack/internal/store"
)

// FR-7.18: a task's time — the push at that time on its day, in place of
// the morning's, and the day before naming it.

func TestPlanTaskDue_FR7_18_ATimeReplacesTheMorningAndIsNamedTheDayBefore(t *testing.T) {
	lookup := func(string) []store.MemberName {
		return []store.MemberName{{UserID: "u-andy", DisplayName: "Andy"}}
	}
	tasks := []store.DueTask{
		{ID: "c-today", TripID: "trip-1", Body: "Tierarzt", DueDate: "2026-07-08", DueTime: "14:00"},
		{ID: "c-tomorrow", TripID: "trip-1", Body: "Hund", DueDate: "2026-07-09", DueTime: "09:30"},
		{ID: "c-plain", TripID: "trip-1", Body: "Pass", DueDate: "2026-07-08"},
	}
	type sent struct{ comment, due, time string }
	var got []sent
	for _, n := range planTaskDue(tasks, "2026-07-08", "2026-07-09", lookup) {
		at, _ := n.Payload[payloadTime].(string)
		got = append(got, sent{n.Payload[payloadCommentID].(string), n.Payload[payloadDue].(string), at})
	}
	want := []sent{{"c-tomorrow", dueTomorrow, "09:30"}, {"c-plain", dueToday, ""}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("plan = %v\nwant %v", got, want)
	}
}

func TestPlanTimedTaskDue_FR7_18_InsideTheWindowOnly(t *testing.T) {
	lookup := func(string) []store.MemberName {
		return []store.MemberName{{UserID: "u-andy", DisplayName: "Andy"}, {UserID: "u-sia", DisplayName: "Sia"}}
	}
	task := func(id, day, at, assignee string) store.DueTask {
		return store.DueTask{ID: id, TripID: "trip-1", Body: "body " + id, DueDate: day, DueTime: at, Assignee: assignee}
	}
	tasks := []store.DueTask{
		task("c-at-from", "2026-07-08", "13:59", ""),
		task("c-in", "2026-07-08", "14:00", "u-sia"),
		task("c-at-to", "2026-07-08", "14:05", ""),
		task("c-after", "2026-07-08", "14:06", ""),
		task("c-untimed", "2026-07-08", "", ""),
		task("c-tomorrow", "2026-07-09", "14:01", ""),
	}
	type sent struct{ user, comment string }
	var got []sent
	for _, n := range planTimedTaskDue(tasks, "2026-07-08", "2026-07-08 13:59", "2026-07-08 14:05", lookup) {
		if n.Kind != store.NotifyTaskDue || n.Payload[payloadDue] != dueNow || n.Payload[payloadTime] == nil {
			t.Errorf("want a task_due for now with its time, have %+v", n)
		}
		got = append(got, sent{n.UserID, n.Payload[payloadCommentID].(string)})
	}
	// (from, to]: the minute already sent is not sent again; the assignee
	// rule is FR-7.11's.
	want := []sent{{"u-sia", "c-in"}, {"u-andy", "c-at-to"}, {"u-sia", "c-at-to"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("plan = %v\nwant %v", got, want)
	}
}

func TestNextTick_FR7_18_TheNextWholeMinute(t *testing.T) {
	zurich, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		t.Fatalf("load zone: %v", err)
	}
	for _, tc := range []struct {
		name      string
		now, want time.Time
	}{
		{"inside a minute", time.Date(2026, 7, 8, 13, 59, 42, 5, zurich), time.Date(2026, 7, 8, 14, 0, 0, 0, zurich)},
		{"on the minute", time.Date(2026, 7, 8, 14, 0, 0, 0, zurich), time.Date(2026, 7, 8, 14, 1, 0, 0, zurich)},
		{"across midnight", time.Date(2026, 7, 8, 23, 59, 1, 0, zurich), time.Date(2026, 7, 9, 0, 0, 0, 0, zurich)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := nextTick(tc.now); !got.Equal(tc.want) {
				t.Errorf("nextTick = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestRemindTimed_FR7_18_OnceAtItsTimeAgainWhenMovedNeverWhenPassed(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	exec := func(q string) {
		t.Helper()
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}
	exec(`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u-local', 'local', 'Ich')`)
	exec(`INSERT INTO trips (id, name, year, start_date, end_date) VALUES ('trip-1', 'Samedan', 2026, '2026-07-10', '2026-07-20')`)
	exec(`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-1', 'u-local', 'owner')`)
	exec(`INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state, due_date, due_time)
		VALUES ('c-1', 'trip-1', 'u-local', 'Tierarzt', 1, 'open', '2026-07-08', '14:00')`)

	clock := time.Date(2026, 7, 8, 13, 58, 0, 0, time.UTC)
	n := New(st, nopPinger{}, Options{Now: func() time.Time { return clock }})
	ctx := context.Background()
	count := func() int {
		t.Helper()
		if err := n.Wait(ctx); err != nil {
			t.Fatal(err)
		}
		list, err := st.ListNotifications(ctx, "u-local", false, 50)
		if err != nil {
			t.Fatal(err)
		}
		return len(list)
	}
	tick := func(d time.Duration) {
		t.Helper()
		clock = clock.Add(d)
		n.remindTimed(ctx)
	}

	tick(0) // the first run only sets the mark
	tick(time.Minute)
	if count() != 0 {
		t.Fatal("reminded before its time")
	}
	tick(time.Minute)
	if count() != 1 {
		t.Fatalf("at 14:00: want one reminder, have %d", count())
	}
	tick(0) // a second wake-up in the same minute
	tick(time.Minute)
	if count() != 1 {
		t.Fatal("reminded twice")
	}
	// Moved to later the same day: reminded again at the new time.
	exec(`UPDATE comments SET due_time = '16:00' WHERE id = 'c-1'`)
	tick(2 * time.Hour)
	if count() != 2 {
		t.Fatalf("at 16:00 after the move: want two reminders, have %d", count())
	}
	// Moved to a time already gone: nothing.
	exec(`UPDATE comments SET due_time = '15:00' WHERE id = 'c-1'`)
	tick(time.Minute)
	if count() != 2 {
		t.Fatal("a time set after it had passed was reminded of")
	}
	// A downtime over a timed task's minute: sent late, on the next run.
	exec(`UPDATE comments SET due_time = '18:00' WHERE id = 'c-1'`)
	clock = clock.Add(3 * time.Hour)
	n.remindTimed(ctx)
	if count() != 3 {
		t.Fatalf("after a downtime over 18:00: want three reminders, have %d", count())
	}
	// A downtime over midnight never sends yesterday's.
	exec(`UPDATE comments SET due_time = '23:30' WHERE id = 'c-1'`)
	clock = time.Date(2026, 7, 9, 0, 30, 0, 0, time.UTC)
	n.remindTimed(ctx)
	if count() != 3 {
		t.Fatal("a past day's time was reminded of")
	}
}
