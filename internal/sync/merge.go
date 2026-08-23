package sync

import "sort"

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

// Item states that the terminal-precedence rule (NFR-4.2a rule 2) names.
const (
	StatePacked     = "packed"
	StatePackingNow = "packing_now"
)

// FieldState is the trip_items column the state machine lives on.
const FieldState = "state"

// Mutation is one client-side change from the push envelope.
type Mutation struct {
	MutationID string
	Op         Op
	Table      string
	ID         string
	Fields     map[string]any
	HLC        HLC
}

// FieldClocks records, per field, the HLC of the write that last set it —
// the "row.updated_hlc(f-group)" of Sync-API Spec §6. A field that is
// missing here is as old as the row itself (Row.HLC): rows written before
// the per-field record existed, or by a path that does not merge, fall
// back to row-level precedence rather than to "never written".
type FieldClocks map[string]HLC

// Row is what the server currently holds for one entity, as Merge needs
// it. Fields and Clocks are nil when the row does not exist.
type Row struct {
	Exists bool
	Fields map[string]any
	// HLC is the row-level maximum of every write, kept for tombstones
	// (a delete is an all-fields decision) and as the fallback clock.
	HLC    HLC
	Clocks FieldClocks
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
	// Clocks is the row's per-field record after this mutation: every
	// applied field stamped with the mutation's HLC, every other field
	// exactly as it was. The caller persists it beside the row.
	Clocks FieldClocks
}

// stateGroup couples packed_count and state: they encode one logical fact
// (FR-5.4) and must win or lose together, so they share one clock — the
// newest of the two.
var stateGroup = map[string]bool{FieldState: true, "packed_count": true}

// GroupedWith returns every field that merges as one unit with field —
// the field itself included, and just the field where nothing is coupled
// to it. A caller that re-issues one logged field (NFR-4.2a's revert) has
// to carry the whole group, or it writes half of a fact: a restored
// "packed" beside the packed_count that was never restored with it.
func GroupedWith(field string) []string {
	if !stateGroup[field] {
		return []string{field}
	}
	group := make([]string, 0, len(stateGroup))
	for f := range stateGroup {
		group = append(group, f)
	}
	sort.Strings(group)
	return group
}

// additiveFields always apply when set to a truthy value (NFR-4.2a rule 1):
// trip feedback must never be lost to a concurrent write (FR-9.1).
var additiveFields = map[string]bool{"flag_unused": true, "flag_missing": true}

// Merge resolves one mutation against the current row state per
// Sync-API Spec §6. It is a pure function: persistence, permission checks,
// and idempotency (mutation_id replay) live in the calling layer.
//
// Precedence is decided per field against that field's own clock, never
// against the row's: a packing made offline at 10:00 is not displaced by a
// container assigned at 10:30, because the two never competed.
func Merge(row Row, m Mutation) MergeResult {
	res := MergeResult{Applied: map[string]any{}, RowHLC: maxHLC(row.HLC, m.HLC), Clocks: FieldClocks{}}
	for f, c := range row.Clocks {
		res.Clocks[f] = c
	}

	if m.Op == OpDelete {
		res.Deleted = m.HLC > row.HLC
		res.Outcome = outcomeFor(res.Deleted)
		return res
	}

	if !row.Exists {
		for f, v := range m.Fields {
			res.Applied[f] = v
			res.Clocks[f] = m.HLC
		}
		res.Outcome = OutcomeApplied
		return res
	}

	applyGroup := groupDecision(row, m)

	for f, v := range m.Fields {
		switch {
		case additiveFields[f] && isTruthy(v):
			res.apply(f, v, m.HLC)
		case stateGroup[f] && applyGroup:
			res.apply(f, v, m.HLC)
		case stateGroup[f] && !applyGroup:
			res.drop(f, v, row.Fields[f])
		case m.HLC > row.clockOf(f):
			res.apply(f, v, m.HLC)
		default:
			res.drop(f, v, row.Fields[f])
		}
	}

	res.Outcome = outcomeFor(len(res.Conflicts) == 0)
	return res
}

func (r *MergeResult) apply(field string, value any, at HLC) {
	r.Applied[field] = value
	r.Clocks[field] = at
}

func (r *MergeResult) drop(field string, losing, winning any) {
	r.Conflicts = append(r.Conflicts, Conflict{Field: field, LosingValue: losing, WinningValue: winning})
}

// clockOf is the HLC the field was last set at, falling back to the row's.
func (row Row) clockOf(field string) HLC {
	if c, ok := row.Clocks[field]; ok {
		return c
	}
	return row.HLC
}

// groupClock is the state group's clock: the newest write to either of
// its fields, since the two are one fact (FR-5.4).
func (row Row) groupClock() HLC {
	var newest HLC
	for f := range stateGroup {
		newest = maxHLC(newest, row.clockOf(f))
	}
	return newest
}

// groupDecision applies NFR-4.2a rule 2 to the state field group, and
// rule 3 where rule 2 says nothing. Rule 2 is exactly as narrow as §6
// writes it: "packed" beats "packing_now" regardless of HLC, and
// "packing_now" never displaces "packed". Between any other pair of
// states — a packing made offline against a later deliberate unpack or
// skip — the later decision wins and the earlier one is logged, because a
// person made both and only the clock can say which was the last word.
func groupDecision(row Row, m Mutation) bool {
	newer := m.HLC > row.groupClock()
	incoming, hasState := m.Fields[FieldState]
	if !hasState {
		return newer
	}
	current := row.Fields[FieldState]
	switch {
	case incoming == StatePacked && current == StatePackingNow:
		return true
	case incoming == StatePackingNow && current == StatePacked:
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
