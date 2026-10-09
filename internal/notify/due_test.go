package notify

import (
	"context"
	"reflect"
	"testing"
	"time"

	"jitpack/internal/store"
)

// FR-7.11: the daily reminder — its schedule, its recipients, and the
// once-a-day guarantee.

func TestTaskReminderSchedule_FR7_11(t *testing.T) {
	zurich, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		t.Fatalf("load zone: %v", err)
	}
	at := DefaultTaskReminderAt
	for _, tc := range []struct {
		name     string
		now      time.Time
		wantDue  bool
		wantNext time.Time
	}{
		{"before the time", time.Date(2026, 7, 8, 5, 59, 0, 0, zurich), false, time.Date(2026, 7, 8, 6, 0, 0, 0, zurich)},
		{"at the time", time.Date(2026, 7, 8, 6, 0, 0, 0, zurich), true, time.Date(2026, 7, 9, 6, 0, 0, 0, zurich)},
		{"later that day", time.Date(2026, 7, 8, 23, 0, 0, 0, zurich), true, time.Date(2026, 7, 9, 6, 0, 0, 0, zurich)},
		{"across the month", time.Date(2026, 7, 31, 7, 0, 0, 0, zurich), true, time.Date(2026, 8, 1, 6, 0, 0, 0, zurich)},
		// 2026-10-25 is 25 hours long in Zurich: the next reminder stays at
		// 06:00 on the wall clock rather than drifting to 05:00.
		{"over the clock change", time.Date(2026, 10, 24, 7, 0, 0, 0, zurich), true, time.Date(2026, 10, 25, 6, 0, 0, 0, zurich)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := reminderDue(tc.now, at); got != tc.wantDue {
				t.Errorf("reminderDue = %v, want %v", got, tc.wantDue)
			}
			if got := nextReminder(tc.now, at); !got.Equal(tc.wantNext) || got.Hour() != 6 {
				t.Errorf("nextReminder = %v, want %v", got, tc.wantNext)
			}
		})
	}
	// A custom time (JITPACK_TASK_REMINDER_TIME=07:30) reads its minutes.
	if got := nextReminder(time.Date(2026, 7, 8, 7, 0, 0, 0, zurich), 7*time.Hour+30*time.Minute); !got.Equal(time.Date(2026, 7, 8, 7, 30, 0, 0, zurich)) {
		t.Errorf("nextReminder at 07:30 = %v", got)
	}
}

func TestPlanTaskDue_FR7_11_AssigneeElseEveryMember(t *testing.T) {
	members := map[string][]store.MemberName{
		"trip-1": {{UserID: "u-andy", DisplayName: "Andy"}, {UserID: "u-sia", DisplayName: "Sia"}},
		// Single-User: one member, and still reminded (FR-17.3 does not apply).
		"trip-solo": {{UserID: "u-local", DisplayName: "Ich"}},
	}
	lookup := func(tripID string) []store.MemberName { return members[tripID] }
	tasks := []store.DueTask{
		{ID: "c-mine", TripID: "trip-1", Body: "Pass holen", DueDate: "2026-07-08", Assignee: "u-sia"},
		{ID: "c-ours", TripID: "trip-1", Body: "Katze bringen", DueDate: "2026-07-09"},
		{ID: "c-left", TripID: "trip-1", Body: "Schlüssel", DueDate: "2026-07-09", Assignee: "u-gone"},
		{ID: "c-solo", TripID: "trip-solo", Body: "Velo", DueDate: "2026-07-08"},
		{ID: "c-other-day", TripID: "trip-1", Body: "Später", DueDate: "2026-07-12"},
	}
	type sent struct{ user, comment, due string }
	var got []sent
	for _, n := range planTaskDue(tasks, "2026-07-08", "2026-07-09", lookup) {
		if n.Kind != store.NotifyTaskDue {
			t.Errorf("kind = %q", n.Kind)
		}
		if _, named := n.Payload[payloadActorID]; named {
			t.Errorf("a reminder names no actor: %v", n.Payload)
		}
		got = append(got, sent{n.UserID, n.Payload[payloadCommentID].(string), n.Payload[payloadDue].(string)})
	}
	want := []sent{
		{"u-sia", "c-mine", dueToday},
		{"u-andy", "c-ours", dueTomorrow}, {"u-sia", "c-ours", dueTomorrow},
		// An assignee who left the trip is nobody's any more: everybody hears.
		{"u-andy", "c-left", dueTomorrow}, {"u-sia", "c-left", dueTomorrow},
		{"u-local", "c-solo", dueToday},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("plan = %v\nwant %v", got, want)
	}
}

func TestPlanShoppingDue_FR30_12_AssigneeElseEveryMember(t *testing.T) {
	members := map[string][]store.MemberName{
		"trip-1":    {{UserID: "u-andy", DisplayName: "Andy"}, {UserID: "u-sia", DisplayName: "Sia"}},
		"trip-solo": {{UserID: "u-local", DisplayName: "Ich"}},
	}
	lookup := func(tripID string) []store.MemberName { return members[tripID] }
	entries := []store.DueShoppingEntry{
		{ID: "e-milk", TripID: "trip-1", Name: "Milch", DueDate: "2026-07-08"},
		{ID: "e-solo", TripID: "trip-solo", Name: "Brot", DueDate: "2026-07-09"},
		{ID: "e-later", TripID: "trip-1", Name: "Später", DueDate: "2026-07-12"},
		{ID: "e-sias", TripID: "trip-1", Name: "Käse", DueDate: "2026-07-09", Assignee: "u-sia"},
		{ID: "e-left", TripID: "trip-1", Name: "Wein", DueDate: "2026-07-09", Assignee: "u-gone"},
	}
	type sent struct{ user, entry, name, due string }
	var got []sent
	for _, n := range planShoppingDue(entries, "2026-07-08", "2026-07-09", lookup) {
		if n.Kind != store.NotifyShoppingDue {
			t.Errorf("kind = %q", n.Kind)
		}
		if _, named := n.Payload[payloadActorID]; named {
			t.Errorf("a reminder names no actor: %v", n.Payload)
		}
		got = append(got, sent{n.UserID, n.Payload[payloadEntryID].(string), n.Payload[payloadItemName].(string), n.Payload[payloadDue].(string)})
	}
	want := []sent{
		{"u-andy", "e-milk", "Milch", dueToday}, {"u-sia", "e-milk", "Milch", dueToday},
		// Single-User: one member, and still reminded.
		{"u-local", "e-solo", "Brot", dueTomorrow},
		// FR-30.12: handed to Sia, so only Sia hears.
		{"u-sia", "e-sias", "Käse", dueTomorrow},
		// An assignee who left the trip is nobody's any more: everybody hears.
		{"u-andy", "e-left", "Wein", dueTomorrow}, {"u-sia", "e-left", "Wein", dueTomorrow},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("plan = %v\nwant %v", got, want)
	}
}

func TestPlanExcursionDue_FR31_9_ParticipantsElseEveryMember(t *testing.T) {
	members := map[string][]store.MemberName{
		"trip-1":    {{UserID: "u-andy", DisplayName: "Andy"}, {UserID: "u-sia", DisplayName: "Sia"}},
		"trip-solo": {{UserID: "u-local", DisplayName: "Ich"}},
	}
	lookup := func(tripID string) []store.MemberName { return members[tripID] }
	excursions := []store.DueExcursion{
		{ID: "x-all", TripID: "trip-1", Name: "Tageswanderung", StartsOn: "2026-07-08"},
		{ID: "x-solo", TripID: "trip-solo", Name: "Bootsausflug", StartsOn: "2026-07-09"},
		{ID: "x-later", TripID: "trip-1", Name: "Später", StartsOn: "2026-07-12"},
		{ID: "x-sia", TripID: "trip-1", Name: "Hüttentour", StartsOn: "2026-07-09", Participants: []string{"u-sia"}},
		{ID: "x-left", TripID: "trip-1", Name: "Klettern", StartsOn: "2026-07-09", Participants: []string{"u-gone"}},
	}
	type sent struct{ user, excursion, name, due string }
	var got []sent
	for _, n := range planExcursionDue(excursions, "2026-07-08", "2026-07-09", lookup) {
		if n.Kind != store.NotifyExcursionDue {
			t.Errorf("kind = %q", n.Kind)
		}
		if _, named := n.Payload[payloadActorID]; named {
			t.Errorf("a reminder names no actor: %v", n.Payload)
		}
		got = append(got, sent{n.UserID, n.Payload[payloadExcursionID].(string), n.Payload[payloadItemName].(string), n.Payload[payloadDue].(string)})
	}
	want := []sent{
		// Nobody named: everybody goes, everybody hears.
		{"u-andy", "x-all", "Tageswanderung", dueToday}, {"u-sia", "x-all", "Tageswanderung", dueToday},
		// Single-User: one member, and still reminded.
		{"u-local", "x-solo", "Bootsausflug", dueTomorrow},
		// Only Sia goes, so only Sia hears.
		{"u-sia", "x-sia", "Hüttentour", dueTomorrow},
		// A participant who left the trip is nobody's any more: everybody hears.
		{"u-andy", "x-left", "Klettern", dueTomorrow}, {"u-sia", "x-left", "Klettern", dueTomorrow},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("plan = %v\nwant %v", got, want)
	}
}

func TestRemindDue_FR7_11_OnceADayFromTheConfiguredTime(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u-local', 'local', 'Ich')`,
		`INSERT INTO trips (id, name, year, start_date, end_date) VALUES ('trip-1', 'Samedan', 2026, '2026-07-10', '2026-07-20')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-1', 'u-local', 'owner')`,
		`INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state, due_date)
			VALUES ('c-1', 'trip-1', 'u-local', 'Pass holen', 1, 'open', '2026-07-09')`,
		// FR-30.10: a purchase due the same day rides the same run.
		`INSERT INTO shopping_entries (id, trip_id, name, due_date) VALUES ('e-1', 'trip-1', 'Milch', '2026-07-09')`,
		// FR-31.9: an excursion starting that day, with a line still open.
		`INSERT INTO excursions (id, trip_id, name, starts_on) VALUES ('x-1', 'trip-1', 'Wanderung', '2026-07-09')`,
		`INSERT INTO excursion_items (id, trip_id, excursion_id, name) VALUES ('xi-1', 'trip-1', 'x-1', 'Proviant')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}
	clock := time.Date(2026, 7, 8, 5, 59, 0, 0, time.UTC)
	// One member — the trip a Single-User instance has — and still reminded.
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

	if n.remindDue(ctx, DefaultTaskReminderAt) || count() != 0 {
		t.Fatal("reminded before the configured time")
	}
	clock = clock.Add(time.Minute)
	// One for the task, one for the purchase, one for the excursion.
	if !n.remindDue(ctx, DefaultTaskReminderAt) || count() != 3 {
		t.Fatalf("at 06:00: want three reminders, have %d", count())
	}
	// The loop waking again, or the server restarting, the same day.
	clock = clock.Add(3 * time.Hour)
	if n.remindDue(ctx, DefaultTaskReminderAt) || count() != 3 {
		t.Fatal("reminded twice in one day")
	}
	// The due day itself: the second and last reminder.
	clock = clock.Add(24 * time.Hour)
	if !n.remindDue(ctx, DefaultTaskReminderAt) || count() != 6 {
		t.Fatalf("on the due day: want six reminders, have %d", count())
	}
	list, _ := st.ListNotifications(ctx, "u-local", false, 50)
	dues := map[string]map[any]bool{store.NotifyTaskDue: {}, store.NotifyShoppingDue: {}, store.NotifyExcursionDue: {}}
	for _, n := range list {
		switch {
		case n.Kind == store.NotifyTaskDue && n.Payload[payloadCommentID] == "c-1":
		case n.Kind == store.NotifyShoppingDue && n.Payload[payloadEntryID] == "e-1":
		case n.Kind == store.NotifyExcursionDue && n.Payload[payloadExcursionID] == "x-1":
		default:
			t.Errorf("unexpected notification %+v", n)
			continue
		}
		dues[n.Kind][n.Payload[payloadDue]] = true
	}
	for kind, days := range dues {
		if !days[dueToday] || !days[dueTomorrow] {
			t.Errorf("%s: want one of each day, have %v", kind, days)
		}
	}
	// Overdue: no repeat reminder.
	clock = clock.Add(24 * time.Hour)
	if !n.remindDue(ctx, DefaultTaskReminderAt) || count() != 6 {
		t.Fatal("an overdue task, purchase or excursion was reminded again")
	}
}

func TestRunReminders_StopsWithItsContext(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	n := New(st, nopPinger{}, Options{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		n.RunReminders(ctx, DefaultTaskReminderAt)
		close(done)
	}()
	cancel()
	<-done
}
