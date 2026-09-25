package store

import (
	"context"
	"reflect"
	"testing"
)

// FR-7.11: the reminder's reads.

func TestDueTasks_FR7_11_OpenTasksOnTheAskedDaysOnly(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year, start_date, end_date, status)
		VALUES ('trip-old', 'Alt', 2025, '2025-07-10', '2025-07-20', 'archived')`)
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-1', ?, 'Salbe')`, testTrip)
	task := func(id, trip, item, state, due string, assignee any) {
		t.Helper()
		var itemID any
		if item != "" {
			itemID = item
		}
		var dueDate any
		if due != "" {
			dueDate = due
		}
		mustExec(t, s, `INSERT INTO comments (id, trip_id, trip_item_id, author_id, body, is_task, task_state, due_date, assignee_user_id)
			VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`, id, trip, itemID, testUser, "body "+id, state, dueDate, assignee)
	}
	task("c-today", testTrip, "", "open", "2026-07-08", nil)
	task("c-tomorrow", testTrip, "ti-1", "open", "2026-07-09", testUser)
	task("c-later", testTrip, "", "open", "2026-07-12", nil)
	task("c-undated", testTrip, "", "open", "", nil)
	task("c-done", testTrip, "", "resolved", "2026-07-08", nil)
	task("c-archived", "trip-old", "", "open", "2026-07-08", nil)
	// A note is not a task, whatever its column says.
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, is_task, due_date)
		VALUES ('c-note', ?, ?, 'note', 0, '2026-07-08')`, testTrip, testUser)

	got, err := s.DueTasks(ctx, "2026-07-08", "2026-07-09")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	want := []DueTask{
		{ID: "c-today", TripID: testTrip, Body: "body c-today", DueDate: "2026-07-08"},
		{ID: "c-tomorrow", TripID: testTrip, Body: "body c-tomorrow", DueDate: "2026-07-09", Assignee: testUser},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DueTasks = %+v\nwant %+v", got, want)
	}

	none, err := s.DueTasks(ctx)
	if err != nil || none != nil {
		t.Errorf("DueTasks() = %v, %v; want nil, nil", none, err)
	}
}

func TestClaimTaskReminderDay_FR7_11_OncePerDay(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	steps := []struct {
		day  string
		want bool
	}{
		{"2026-07-08", true},  // first run ever
		{"2026-07-08", false}, // a restart the same day
		{"2026-07-09", true},  // the next day
		{"2026-07-09", false},
	}
	for _, st := range steps {
		got, err := s.ClaimTaskReminderDay(ctx, st.day)
		if err != nil {
			t.Fatalf("ClaimTaskReminderDay(%s): %v", st.day, err)
		}
		if got != st.want {
			t.Errorf("ClaimTaskReminderDay(%s) = %v, want %v", st.day, got, st.want)
		}
	}
}
