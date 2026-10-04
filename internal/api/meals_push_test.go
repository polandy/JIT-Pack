package api_test

import (
	"testing"

	"jitpack/internal/store"
)

// FR-33.3 through the push path: an ingredient bought on the shopping list
// reaches the pull with the pusher as its buyer — FR-30.4's stamp, whatever
// the client claimed — and a taken-back purchase with neither buyer nor time.
func TestPush_MealIngredientPurchase_StampsTheBuyer_FR33_3(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "meal-1", "op": "insert", "table": store.TableMeals, "id": "meal-1",
		"fields": map[string]any{"trip_id": trip, "on_date": "2026-10-12", "slot": "dinner", "title": "Raclette"},
		"hlc":    "0000000001000-0000-aaaaaaaa",
	})
	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "ing-1", "op": "insert", "table": store.TableMealIngredients, "id": "ing-1",
		"fields": map[string]any{"trip_id": trip, "meal_id": "meal-1", "name": "Kartoffeln", "list": "buy_local", "bought": 0},
		"hlc":    "0000000001001-0000-aaaaaaaa",
	})
	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "ing-2", "op": "upsert", "table": store.TableMealIngredients, "id": "ing-1",
		"fields": map[string]any{"bought": 1, "bought_at": "2026-10-12T09:15:00Z", "bought_by_user_id": userB},
		"hlc":    "0000000002000-0000-aaaaaaaa",
	})

	row := pulledRow(t, srv.URL, "ing-1")
	if row["bought_by_user_id"] != userA {
		t.Errorf("bought_by_user_id = %v, want %s — the pusher, not the client's claim", row["bought_by_user_id"], userA)
	}
	if row["bought_at"] != "2026-10-12T09:15:00Z" {
		t.Errorf("bought_at = %v, want the tap time", row["bought_at"])
	}

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "ing-3", "op": "upsert", "table": store.TableMealIngredients, "id": "ing-1",
		"fields": map[string]any{"bought": 0},
		"hlc":    "0000000003000-0000-aaaaaaaa",
	})
	row = pulledRow(t, srv.URL, "ing-1")
	if row["bought_by_user_id"] != nil || row["bought_at"] != nil {
		t.Errorf("record = (%v, %v), want both cleared", row["bought_by_user_id"], row["bought_at"])
	}
}
