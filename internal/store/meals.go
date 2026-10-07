package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// validIngredientMeal keeps a meal's ingredient on a meal of its own trip
// (FR-33.2): naming another trip's meal would put a line on that trip's
// shopping list from outside it. A write that leaves meal_id alone is judged
// by the row it changes, which was judged when it was written.
func validIngredientMeal(ctx context.Context, tx *sql.Tx, in guardInput) (RejectReason, error) {
	tripID, m := in.tripID, in.m
	id, named := m.Fields["meal_id"].(string)
	if !named {
		return ReasonNone, nil
	}
	var mealTrip string
	err := tx.QueryRowContext(ctx, `SELECT trip_id FROM meals WHERE id = ?`, id).Scan(&mealTrip)
	if errors.Is(err, sql.ErrNoRows) {
		return ReasonConstraintViolated, nil
	}
	if err != nil {
		return ReasonNone, fmt.Errorf("ingredient meal lookup: %w", err)
	}
	if mealTrip != tripID {
		return ReasonConstraintViolated, nil
	}
	return ReasonNone, nil
}
