package sync

// Op is the mutation kind carried in a push envelope (Sync-API Spec §5).
type Op string

const (
	OpInsert Op = "insert"
	OpUpsert Op = "upsert"
	OpDelete Op = "delete"
)

// Outcome is the per-mutation result reported back to the client.
type Outcome string

const (
	OutcomeApplied Outcome = "applied"
	OutcomeMerged  Outcome = "merged"
)

// Mutation is one client-side change from the push envelope.
type Mutation struct {
	MutationID string
	Op         Op
	Table      string
	ID         string
	Fields     map[string]any
	HLC        HLC
}

// Conflict records a dropped field for the conflict_log (NFR-4.2a).
type Conflict struct {
	Field        string
	LosingValue  any
	WinningValue any
}

// MergeResult tells the caller which fields to persist and what to log.
type MergeResult struct {
	Outcome   Outcome
	Applied   map[string]any
	Conflicts []Conflict
	Deleted   bool
	RowHLC    HLC
}

// stateGroup couples packed_count and state: they encode one logical fact
// (FR-5.4) and must win or lose together.
var stateGroup = map[string]bool{"state": true, "packed_count": true}

// additiveFields always apply when set to a truthy value (NFR-4.2a rule 1):
// trip feedback must never be lost to a concurrent write (FR-9.1).
var additiveFields = map[string]bool{"flag_unused": true, "flag_missing": true}

// Merge resolves one mutation against the current row state per
// Sync-API Spec §6. It is a pure function: persistence, permission checks,
// and idempotency (mutation_id replay) live in the calling layer.
func Merge(current map[string]any, currentHLC HLC, exists bool, m Mutation) MergeResult {
	res := MergeResult{Applied: map[string]any{}, RowHLC: maxHLC(currentHLC, m.HLC)}

	if m.Op == OpDelete {
		res.Deleted = m.HLC > currentHLC
		res.Outcome = outcomeFor(res.Deleted)
		return res
	}

	if !exists {
		for f, v := range m.Fields {
			res.Applied[f] = v
		}
		res.Outcome = OutcomeApplied
		return res
	}

	newer := m.HLC > currentHLC
	applyGroup := groupDecision(current, m, newer)

	for f, v := range m.Fields {
		switch {
		case additiveFields[f] && isTruthy(v):
			res.Applied[f] = v
		case stateGroup[f] && applyGroup:
			res.Applied[f] = v
		case stateGroup[f] && !applyGroup:
			res.Conflicts = append(res.Conflicts, Conflict{Field: f, LosingValue: v, WinningValue: current[f]})
		case newer:
			res.Applied[f] = v
		default:
			res.Conflicts = append(res.Conflicts, Conflict{Field: f, LosingValue: v, WinningValue: current[f]})
		}
	}

	res.Outcome = outcomeFor(len(res.Conflicts) == 0)
	return res
}

// groupDecision applies NFR-4.2a rule 2 to the state field group:
// terminal "packed" always wins; "packing_now" never displaces "packed";
// everything else falls back to LWW (rule 3).
func groupDecision(current map[string]any, m Mutation, newer bool) bool {
	incoming, hasState := m.Fields["state"]
	if !hasState {
		return newer
	}
	switch {
	case incoming == "packed":
		return true
	case incoming == "packing_now" && current["state"] == "packed":
		return false
	default:
		return newer
	}
}

func outcomeFor(applied bool) Outcome {
	if applied {
		return OutcomeApplied
	}
	return OutcomeMerged
}

func isTruthy(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case int:
		return x != 0
	case int64:
		return x != 0
	case float64:
		return x != 0
	default:
		return false
	}
}

func maxHLC(a, b HLC) HLC {
	if a > b {
		return a
	}
	return b
}
