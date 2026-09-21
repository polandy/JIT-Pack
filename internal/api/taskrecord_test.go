package api

import (
	"testing"
	"time"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// FR-7.7 at the stamping layer: who ticked a task off is written from the
// authenticated pusher, never from the client — FR-25.19's packing record and
// FR-30.4's purchase, applied to a task. The time may come from the tap,
// because a task is ticked off away from a network; an unreadable one is
// replaced by the server's clock. Both are cleared when the task is reopened,
// so a record never outlives what it describes.
func TestStampActor_TaskResolution_FR7_7(t *testing.T) {
	const acting = "user-andy"
	const tapped = "2026-09-20T14:32:00Z"
	fixed := func() time.Time { return time.Date(2026, 9, 21, 8, 0, 0, 0, time.UTC) }
	const serverNow = "2026-09-21T08:00:00Z"

	tests := []struct {
		name   string
		fields map[string]any
		wantBy any
		wantAt any
	}{
		{
			name:   "ticking a task off stamps the resolver and keeps the tap time",
			fields: map[string]any{"task_state": "resolved", "resolved_at": tapped},
			wantBy: acting, wantAt: tapped,
		},
		{
			name:   "a forged resolver is overwritten",
			fields: map[string]any{"task_state": "resolved", "resolved_by_user_id": "user-sia", "resolved_at": tapped},
			wantBy: acting, wantAt: tapped,
		},
		{
			name:   "an unreadable tap time falls back to the server clock",
			fields: map[string]any{"task_state": "resolved", "resolved_at": "gestern"},
			wantBy: acting, wantAt: serverNow,
		},
		{
			name:   "unticking a task clears both",
			fields: map[string]any{"task_state": "open", "resolved_by_user_id": "user-sia", "resolved_at": tapped},
			wantBy: nil, wantAt: nil,
		},
		{
			name:   "a resolver smuggled in without a state is dropped",
			fields: map[string]any{"body": "Salbe holen", "resolved_by_user_id": "user-sia", "resolved_at": tapped},
			wantBy: absent, wantAt: absent,
		},
		{
			name:   "moving a task to the other phase is no resolution",
			fields: map[string]any{"phase": "during", "resolved_by_user_id": "user-sia"},
			wantBy: absent, wantAt: absent,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := &syncpkg.Mutation{Table: store.TableComments, Op: syncpkg.OpUpsert, Fields: tc.fields}

			stampActor(m, acting, fixed)

			assertPresence(t, m, "resolved_by_user_id", tc.wantBy)
			assertPresence(t, m, "resolved_at", tc.wantAt)
		})
	}
}

// The phase is the user's statement about when a task is due, not an identity
// claim — so it passes through untouched, the way bought_from does beside the
// purchase record it sits next to (FR-25.11j).
func TestStampActor_TaskPhase_IsTheClientsToChoose_FR7_7(t *testing.T) {
	m := &syncpkg.Mutation{
		Table:  store.TableComments,
		Op:     syncpkg.OpUpsert,
		Fields: map[string]any{"phase": "during"},
	}

	stampActor(m, "user-andy", time.Now)

	if got := m.Fields["phase"]; got != "during" {
		t.Errorf("phase = %v, want the client's value to survive", got)
	}
}

// A task created and ticked off in one insert is still authored by the pusher
// and resolved by them: the author is decided once at birth, the resolution
// follows the state, and neither reads a client-sent id.
func TestStampActor_TaskInsertedResolved_StampsBoth_FR7_7(t *testing.T) {
	const acting = "user-andy"
	m := &syncpkg.Mutation{
		Table: store.TableComments,
		Op:    syncpkg.OpInsert,
		Fields: map[string]any{
			"body":                "Salbe holen",
			"is_task":             1,
			"task_state":          "resolved",
			"author_id":           "user-sia",
			"resolved_by_user_id": "user-sia",
		},
	}

	stampActor(m, acting, func() time.Time { return time.Date(2026, 9, 21, 8, 0, 0, 0, time.UTC) })

	if got := m.Fields["author_id"]; got != acting {
		t.Errorf("author_id = %v, want %q", got, acting)
	}
	if got := m.Fields["resolved_by_user_id"]; got != acting {
		t.Errorf("resolved_by_user_id = %v, want %q", got, acting)
	}
}
