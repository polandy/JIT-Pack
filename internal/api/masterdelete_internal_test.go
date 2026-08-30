package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"jitpack/internal/store"
)

// The two answers no request can currently provoke — with today's allowlist a
// delete is neither refused nor aimed at an undeletable table — tested at the
// function rather than through the mux, because the alternative to testing
// them is deleting them, and what they guard is worth more than that: a
// refusal that fell through to 200 would tell a cleanup script the row is
// gone while it is still there.
func TestMasterDeleteWriters_NeverReportARefusalAsADeletion(t *testing.T) {
	t.Run("a rejected mutation is a 409, never a 200", func(t *testing.T) {
		rec := httptest.NewRecorder()
		writeMasterDeleteRefusal(rec, store.ReasonConstraintViolated)

		if rec.Code != http.StatusConflict {
			t.Errorf("status = %d, want 409", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), string(store.ReasonConstraintViolated)) {
			t.Errorf("body %s does not name the reason — the caller cannot tell what refused it",
				rec.Body.String())
		}
	})

	t.Run("a table with no delete endpoint is this server's bug, not the caller's", func(t *testing.T) {
		rec := httptest.NewRecorder()
		writeMasterDeleteError(rec, store.ErrMasterTableNotDeletable)

		if rec.Code != http.StatusInternalServerError {
			t.Errorf("status = %d, want 500 — a route wired to a table the store refuses is not a 4xx",
				rec.Code)
		}
	})
}
