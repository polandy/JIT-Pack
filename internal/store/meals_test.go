package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

// insertMeal is one meal of the test trip, pushed as a client pushes it.
func insertMeal(id string, hlc string, fields map[string]any) sync.Mutation {
	row := map[string]any{"trip_id": testTrip, "on_date": "2026-10-12", "slot": "dinner", "title": "Raclette"}
	for k, v := range fields {
		row[k] = v
	}
	return sync.Mutation{
		MutationID: "mut-" + id, Op: sync.OpInsert, Table: TableMeals, ID: id, Fields: row, HLC: sync.HLC(hlc),
	}
}

// insertIngredient is one ingredient of a meal, pushed as a client pushes it.
func insertIngredient(id, mealID, hlc string) sync.Mutation {
	return sync.Mutation{
		MutationID: "mut-" + id, Op: sync.OpInsert, Table: TableMealIngredients, ID: id,
		Fields: map[string]any{
			"trip_id": testTrip, "meal_id": mealID, "name": "Kartoffeln", "amount": "1 kg",
			"list": "buy_local", "position": 0,
		},
		HLC: sync.HLC(hlc),
	}
}

// FR-33.1/33.2/33.9 through the push path: a meal and its ingredients travel
// the trip partition, and deleting the meal tombstones every ingredient, so
// another device's shopping list loses them too.
func TestApplyMutation_DeletingAMealTombstonesItsIngredients_FR33_9(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	for _, m := range []sync.Mutation{
		insertMeal("meal-1", "0000000001000-0000-aaaaaaaa", nil),
		insertIngredient("ing-1", "meal-1", "0000000001001-0000-aaaaaaaa"),
	} {
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", m.Table, res.Outcome, res.Reason, err)
		}
	}
	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	del := sync.Mutation{
		MutationID: "m-del", Op: sync.OpDelete, Table: TableMeals, ID: "meal-1",
		HLC: sync.HLC("0000000009100-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete meal: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	assertTombstoned(t, page, TableMealIngredients, "ing-1")

	mustExec(t, s, `INSERT INTO meals (id, trip_id, on_date, title) VALUES ('meal-2', ?, '2026-10-13', 'Fondue')`, testTrip)
	mustExec(t, s, `DELETE FROM trips WHERE id = ?`, testTrip)
	var left int
	if err := s.db.QueryRow(`SELECT count(*) FROM meals`).Scan(&left); err != nil {
		t.Fatalf("count: %v", err)
	}
	if left != 0 {
		t.Errorf("%d meals outlived their trip", left)
	}
}

// FR-33.1/33.2/33.13: what a column cannot hold — a fifth slot, a third kind,
// a list without its vocabulary, a freshness other than fresh or durable — is
// refused by the table itself.
func TestSchema_MealVocabulary_FR33_1(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO meals (id, trip_id, on_date, title) VALUES ('meal-v', ?, '2026-10-12', 'x')`, testTrip)
	cases := []struct {
		name, table, column, value string
		ok                         bool
	}{
		{"breakfast", "meals", "slot", "breakfast", true},
		{"a snack", "meals", "slot", "snack", true},
		{"no fifth slot", "meals", "slot", "brunch", false},
		{"eaten out", "meals", "kind", "out", true},
		{"no third kind", "meals", "kind", "delivery", false},
		{"bought before", "meal_ingredients", "list", "buy_before", true},
		{"never packed", "meal_ingredients", "list", "pack", false},
		{"fresh", "meal_ingredients", "fresh", "1", true},
		{"durable", "meal_ingredients", "fresh", "0", true},
		{"no third freshness", "meal_ingredients", "fresh", "2", false},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id := fmt.Sprintf("v-%d", i)
			var err error
			if tc.table == "meals" {
				_, err = s.db.Exec(`INSERT INTO meals (id, trip_id, on_date, title, `+tc.column+`)
				                    VALUES (?, ?, '2026-10-12', 'x', ?)`, id, testTrip, tc.value)
			} else {
				_, err = s.db.Exec(`INSERT INTO meal_ingredients (id, trip_id, meal_id, name, `+tc.column+`)
				                    VALUES (?, ?, 'meal-v', 'x', ?)`, id, testTrip, tc.value)
			}
			if (err == nil) != tc.ok {
				t.Errorf("%s = %q: err %v, want accepted %v", tc.column, tc.value, err, tc.ok)
			}
		})
	}
}

// FR-33.6: a picnic is taken on an excursion of its own trip. One that is
// gone is dropped rather than refused (the excursion was deleted elsewhere);
// one of another trip is refused.
func TestApplyMutation_MealExcursion_KeepsItOnTheTripsOwn_FR33_6(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('ex-own', ?, 'Gletscher')`, testTrip)
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Other', 2026)`)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('ex-foreign', 'trip-other', 'Fremd')`)
	cases := []struct {
		name, excursion string
		want            sync.Outcome
		wantLink        any
	}{
		{"an excursion of the trip", "ex-own", sync.OutcomeApplied, "ex-own"},
		{"an excursion that is gone", "ex-gone", sync.OutcomeApplied, nil},
		{"an excursion of another trip", "ex-foreign", sync.OutcomeRejected, nil},
	}
	for i, tc := range cases {
		id := fmt.Sprintf("meal-x%d", i)
		m := insertMeal(id, fmt.Sprintf("000000000%d000-0000-aaaaaaaa", i+1),
			map[string]any{"slot": "lunch", "excursion_id": tc.excursion})
		res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
		if err != nil || res.Outcome != tc.want {
			t.Fatalf("%s: outcome %q reason %q err %v", tc.name, res.Outcome, res.Reason, err)
		}
		var got any
		err = s.db.QueryRow(`SELECT excursion_id FROM meals WHERE id = ?`, id).Scan(&got)
		if tc.want == sync.OutcomeRejected {
			if !errors.Is(err, sql.ErrNoRows) {
				t.Errorf("%s: the refused meal was written (err %v)", tc.name, err)
			}
			continue
		}
		if err != nil {
			t.Fatalf("%s: read: %v", tc.name, err)
		}
		if got != tc.wantLink {
			t.Errorf("%s: excursion_id = %v, want %v", tc.name, got, tc.wantLink)
		}
	}
}

// FR-33.2: an ingredient belongs to a meal of its own trip — naming another
// trip's meal would put a line on that trip's shopping list from outside it.
func TestApplyMutation_IngredientNamesAMealOfItsTrip_FR33_2(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO meals (id, trip_id, on_date, title) VALUES ('meal-own', ?, '2026-10-12', 'Raclette')`, testTrip)
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Other', 2026)`)
	mustExec(t, s, `INSERT INTO meals (id, trip_id, on_date, title) VALUES ('meal-foreign', 'trip-other', '2026-10-12', 'Fremd')`)
	cases := []struct {
		name, meal string
		want       sync.Outcome
	}{
		{"a meal of the trip", "meal-own", sync.OutcomeApplied},
		{"a meal of another trip", "meal-foreign", sync.OutcomeRejected},
		{"a meal that does not exist", "meal-gone", sync.OutcomeRejected},
	}
	for i, tc := range cases {
		m := insertIngredient(fmt.Sprintf("ing-%d", i), tc.meal, fmt.Sprintf("000000000%d000-0000-aaaaaaaa", i+1))
		res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
		if err != nil || res.Outcome != tc.want {
			t.Errorf("%s: outcome %q reason %q err %v, want %q", tc.name, res.Outcome, res.Reason, err, tc.want)
		}
	}
	// A later write that leaves meal_id alone is judged by the row's own meal.
	upd := sync.Mutation{
		MutationID: "m-upd", Op: sync.OpUpsert, Table: TableMealIngredients, ID: "ing-0",
		Fields: map[string]any{"amount": "2 kg"}, HLC: sync.HLC("0000000009000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, upd); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Errorf("amount change: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
}

// FR-33.13: an ingredient's freshness travels the push path like any of its
// fields — set on one device, cleared back to unset on another.
func TestApplyMutation_IngredientFreshness_FR33_13(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO meals (id, trip_id, on_date, title) VALUES ('meal-1', ?, '2026-10-12', 'Raclette')`, testTrip)
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, insertIngredient("ing-1", "meal-1", "0000000001000-0000-aaaaaaaa")); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("insert: outcome %q reason %q err %v", res.Outcome, res.Reason, err)
	}
	read := func() any {
		var fresh sql.NullInt64
		if err := s.db.QueryRow(`SELECT fresh FROM meal_ingredients WHERE id = 'ing-1'`).Scan(&fresh); err != nil {
			t.Fatalf("read: %v", err)
		}
		if !fresh.Valid {
			return nil
		}
		return fresh.Int64
	}
	if got := read(); got != nil {
		t.Errorf("a new ingredient: fresh = %v, want unset", got)
	}
	steps := []struct {
		value any
		hlc   string
		want  any
	}{
		{1, "0000000002000-0000-aaaaaaaa", int64(1)},
		{nil, "0000000003000-0000-aaaaaaaa", nil},
	}
	for _, step := range steps {
		m := sync.Mutation{
			MutationID: "m-" + step.hlc, Op: sync.OpUpsert, Table: TableMealIngredients, ID: "ing-1",
			Fields: map[string]any{"fresh": step.value}, HLC: sync.HLC(step.hlc),
		}
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("fresh = %v: outcome %q reason %q err %v", step.value, res.Outcome, res.Reason, err)
		}
		if got := read(); got != step.want {
			t.Errorf("after fresh = %v: stored %v, want %v", step.value, got, step.want)
		}
	}
}
