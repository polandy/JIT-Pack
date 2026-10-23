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

// FR-29.21: a preparation step of an idea is due its lead before the idea's
// day — read off the idea, so moving the idea moves the reminder — and not at
// all while the idea has no day or is dropped.
func TestDueTasks_FR29_21_AStepIsDueItsLeadBeforeItsIdeasDay(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	idea := func(id, state string, plannedOn any) {
		t.Helper()
		mustExec(t, s, `INSERT INTO ideas (id, trip_id, author_id, title, state, planned_on)
			VALUES (?, ?, ?, ?, ?, ?)`, id, testTrip, testUser, "idea "+id, state, plannedOn)
	}
	idea("i-planned", "shortlisted", "2026-07-15")
	idea("i-unplanned", "shortlisted", nil)
	idea("i-dropped", "dropped", "2026-07-15")
	step := func(id string, ideaID any, lead int, due any) {
		t.Helper()
		mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state, idea_id, lead_days, due_date)
			VALUES (?, ?, ?, ?, 1, 'open', ?, ?, ?)`, id, testTrip, testUser, "body "+id, ideaID, lead, due)
	}
	step("c-week", "i-planned", 7, nil)
	step("c-eve", "i-planned", 1, nil)
	// A stored due day does not count for a step: the idea's day decides.
	step("c-stale", "i-planned", 3, "2026-07-08")
	step("c-waiting", "i-unplanned", 7, "2026-07-08")
	step("c-dropped", "i-dropped", 7, nil)

	got, err := s.DueTasks(ctx, "2026-07-08", "2026-07-09")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	want := []DueTask{{ID: "c-week", TripID: testTrip, Body: "body c-week", DueDate: "2026-07-08"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DueTasks = %+v\nwant %+v", got, want)
	}

	eve, err := s.DueTasks(ctx, "2026-07-14")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	if len(eve) != 1 || eve[0].ID != "c-eve" {
		t.Errorf("DueTasks(2026-07-14) = %+v; want c-eve alone", eve)
	}
}

// FR-13.4: a series task materialised onto a trip is due its lead before the
// trip's own start — read off the trip, so moving the trip moves the todo
// (ADR-106) — and not at all while the trip has no start date.
func TestDueTasks_FR13_4_ASeriesTaskIsDueItsLeadBeforeTheTripsStart(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year, start_date, end_date)
		VALUES ('trip-undated', 'Ohne Start', 2026, NULL, NULL)`)
	seriesTask := func(id, trip string, lead int, due any) {
		t.Helper()
		mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state, start_lead_days, due_date)
			VALUES (?, ?, ?, ?, 1, 'open', ?, ?)`, id, trip, testUser, "body "+id, lead, due)
	}
	// A stored due day does not count for a series task: the trip's start decides.
	seriesTask("c-week", testTrip, 7, "2026-07-08")
	seriesTask("c-undated", "trip-undated", 7, nil)

	got, err := s.DueTasks(ctx, "2026-07-03")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	want := []DueTask{{ID: "c-week", TripID: testTrip, Body: "body c-week", DueDate: "2026-07-03"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DueTasks(2026-07-03) = %+v\nwant %+v", got, want)
	}

	// Moving the trip's start moves the todo: the lead is read off the
	// trip afresh, never pinned to the day it was first computed on.
	mustExec(t, s, `UPDATE trips SET start_date = '2026-07-17' WHERE id = ?`, testTrip)
	moved, err := s.DueTasks(ctx, "2026-07-03", "2026-07-10")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	if len(moved) != 1 || moved[0].ID != "c-week" || moved[0].DueDate != "2026-07-10" {
		t.Errorf("DueTasks after move = %+v; want c-week alone, due 2026-07-10", moved)
	}

	// A trip with no start date gives its series task no due day at all,
	// on any day asked about.
	none, err := s.DueTasks(ctx, "2026-07-03", "2026-07-10", "2026-08-01")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	for _, d := range none {
		if d.ID == "c-undated" {
			t.Errorf("DueTasks includes c-undated, whose trip has no start date: %+v", none)
		}
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

// FR-7.18: a task's time travels with its day; a preparation step has none
// to give, since its day is its idea's (ADR-104).
func TestDueTasks_FR7_18_CarryTheirTime(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state, due_date, due_time)
		VALUES ('c-timed', ?, ?, 'Tierarzt', 1, 'open', '2026-07-08', '14:00'),
		       ('c-plain', ?, ?, 'Pass', 1, 'open', '2026-07-08', NULL)`, testTrip, testUser, testTrip, testUser)

	got, err := s.DueTasks(ctx, "2026-07-08")
	if err != nil {
		t.Fatalf("DueTasks: %v", err)
	}
	want := []DueTask{
		{ID: "c-plain", TripID: testTrip, Body: "Pass", DueDate: "2026-07-08"},
		{ID: "c-timed", TripID: testTrip, Body: "Tierarzt", DueDate: "2026-07-08", DueTime: "14:00"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DueTasks = %+v\nwant %+v", got, want)
	}
}

// FR-7.18: the timed reminder's mark moves forward only, and hands back
// where it stood — the window the run sends for. The first call ever only
// sets it: nothing before the server knew of times is owed.
func TestAdvanceTimedReminderMark_FR7_18_ForwardOnly(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	steps := []struct {
		to       string
		wantFrom string
		wantOK   bool
	}{
		{"2026-07-08 13:59", "", false},                 // first run ever
		{"2026-07-08 14:00", "2026-07-08 13:59", true},  // the next minute
		{"2026-07-08 14:00", "2026-07-08 14:00", false}, // a second wake-up in it
		{"2026-07-08 13:30", "2026-07-08 14:00", false}, // the clock set back
		{"2026-07-08 16:20", "2026-07-08 14:00", true},  // after a downtime
	}
	for _, st := range steps {
		from, ok, err := s.AdvanceTimedReminderMark(ctx, st.to)
		if err != nil {
			t.Fatalf("AdvanceTimedReminderMark(%s): %v", st.to, err)
		}
		if from != st.wantFrom || ok != st.wantOK {
			t.Errorf("AdvanceTimedReminderMark(%s) = %q, %v; want %q, %v", st.to, from, ok, st.wantFrom, st.wantOK)
		}
	}
}

func TestDueShoppingEntries_FR30_10_OpenEntriesOnTheAskedDaysOnly(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year, start_date, end_date, status)
		VALUES ('trip-old', 'Alt', 2025, '2025-07-10', '2025-07-20', 'archived')`)
	entry := func(id, trip string, bought int, due string) {
		t.Helper()
		var dueDate any
		if due != "" {
			dueDate = due
		}
		mustExec(t, s, `INSERT INTO shopping_entries (id, trip_id, name, bought, due_date) VALUES (?, ?, ?, ?, ?)`,
			id, trip, "name "+id, bought, dueDate)
	}
	entry("e-today", testTrip, 0, "2026-07-08")
	entry("e-tomorrow", testTrip, 0, "2026-07-09")
	entry("e-later", testTrip, 0, "2026-07-12")
	entry("e-undated", testTrip, 0, "")
	entry("e-bought", testTrip, 1, "2026-07-08")
	entry("e-archived", "trip-old", 0, "2026-07-08")
	// FR-30.12: the assignee travels with the entry, for the recipient rule.
	mustExec(t, s, `UPDATE shopping_entries SET assignee_user_id = ? WHERE id = 'e-tomorrow'`, testUser)

	got, err := s.DueShoppingEntries(ctx, "2026-07-08", "2026-07-09")
	if err != nil {
		t.Fatalf("DueShoppingEntries: %v", err)
	}
	want := []DueShoppingEntry{
		{ID: "e-today", TripID: testTrip, Name: "name e-today", DueDate: "2026-07-08"},
		{ID: "e-tomorrow", TripID: testTrip, Name: "name e-tomorrow", DueDate: "2026-07-09", Assignee: testUser},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DueShoppingEntries = %+v\nwant %+v", got, want)
	}

	none, err := s.DueShoppingEntries(ctx)
	if err != nil || none != nil {
		t.Errorf("DueShoppingEntries() = %v, %v; want nil, nil", none, err)
	}
}

// FR-30.12: an assignment notification names the entry by its stored name,
// and an entry that is not there is an error, never an empty name.
func TestShoppingEntryName_FR30_12_NamesTheEntryOrFails(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO shopping_entries (id, trip_id, name) VALUES ('e-bread', ?, 'Brot')`, testTrip)

	name, err := s.ShoppingEntryName(ctx, "e-bread")
	if err != nil || name != "Brot" {
		t.Fatalf("ShoppingEntryName = %q, %v; want Brot", name, err)
	}
	if _, err := s.ShoppingEntryName(ctx, "e-missing"); err == nil {
		t.Error("ShoppingEntryName(missing) = nil error; want one")
	}
}

// FR-31.9: an excursion is reminded of on the days asked about only while it
// still has something to pack, and never on an archived trip. Its linked
// participants travel with it, for the recipient rule.
func TestDueExcursions_FR31_9_StartingOnTheAskedDaysWithSomethingOpen(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year, start_date, end_date, status)
		VALUES ('trip-old', 'Alt', 2025, '2025-07-10', '2025-07-20', 'archived')`)
	excursion := func(id, trip, starts, lineState string) {
		t.Helper()
		var startsOn any
		if starts != "" {
			startsOn = starts
		}
		mustExec(t, s, `INSERT INTO excursions (id, trip_id, name, starts_on) VALUES (?, ?, ?, ?)`,
			id, trip, "name "+id, startsOn)
		if lineState != "" {
			mustExec(t, s, `INSERT INTO excursion_items (id, trip_id, excursion_id, name, state, packed_count)
				VALUES (?, ?, ?, 'x', ?, ?)`, "line-"+id, trip, id, lineState, map[bool]int{true: 1}[lineState == "packed"])
		}
	}
	excursion("x-today", testTrip, "2026-07-08", "open")
	excursion("x-tomorrow", testTrip, "2026-07-09", "partial")
	excursion("x-later", testTrip, "2026-07-12", "open")
	excursion("x-undated", testTrip, "", "open")
	excursion("x-packed", testTrip, "2026-07-08", "packed")
	excursion("x-empty", testTrip, "2026-07-08", "")
	excursion("x-archived", "trip-old", "2026-07-08", "open")
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name, linked_user_id) VALUES ('tr-andy', ?, 'Andy', ?)`, testTrip, testUser)
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name) VALUES ('tr-kid', ?, 'Lio')`, testTrip)
	mustExec(t, s, `INSERT INTO excursion_travelers (id, trip_id, excursion_id, traveler_id) VALUES
		('p-1', ?, 'x-tomorrow', 'tr-andy'), ('p-2', ?, 'x-tomorrow', 'tr-kid')`, testTrip, testTrip)

	got, err := s.DueExcursions(ctx, "2026-07-08", "2026-07-09")
	if err != nil {
		t.Fatalf("DueExcursions: %v", err)
	}
	want := []DueExcursion{
		{ID: "x-today", TripID: testTrip, Name: "name x-today", StartsOn: "2026-07-08"},
		{ID: "x-tomorrow", TripID: testTrip, Name: "name x-tomorrow", StartsOn: "2026-07-09", Participants: []string{testUser}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DueExcursions = %+v\nwant %+v", got, want)
	}

	none, err := s.DueExcursions(ctx)
	if err != nil || none != nil {
		t.Errorf("DueExcursions() = %v, %v; want nil, nil", none, err)
	}
}
