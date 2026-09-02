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
	// Neither of the next two is produced by the merge itself: the store
	// reports them for a mutation it refused and for one it has already
	// applied. They live here so the four words are one vocabulary rather
	// than three spellings across three packages (NFR-4.14).
	OutcomeRejected  Outcome = "rejected"
	OutcomeDuplicate Outcome = "duplicate"
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

// Set writes one field, creating the map when the mutation carries none yet.
// A mutation decoded from a push may have no Fields at all, so every caller
// that stamps a column (invariant 3) needs the nil check this holds.
func (m *Mutation) Set(field string, value any) {
	if m.Fields == nil {
		m.Fields = map[string]any{}
	}
	m.Fields[field] = value
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
		case additiveFields[f] && IsTruthy(v):
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
	// A conflict is a record of a value that was overwritten. A field the
	// losing push carried along unchanged overwrote nothing: it still does
	// not win the write, but there is nothing to show and nothing to revert
	// (NFR-4.2a). Logging it anyway fills the log with "2026 -> 2026" rows
	// and turns an outcome of applied into merged, which the client
	// announces to a user whose data was never touched.
	if sameValue(losing, winning) {
		return
	}
	r.Conflicts = append(r.Conflicts, Conflict{Field: field, LosingValue: losing, WinningValue: winning})
}

// sameValue reports whether two field values are the same value, across the
// two type systems they reach Merge in: a mutation's fields are decoded from
// JSON (every number a float64, booleans as bool), the row's are read from
// SQLite (INTEGER as int64, booleans stored as 0/1). A pair that differs only
// in how it was carried is not a difference.
//
// Anything neither numeric, textual nor null is reported as different, so an
// unforeseen shape keeps the old behaviour of logging a conflict rather than
// silently swallowing one.
func sameValue(a, b any) bool {
	if na, aNum := asNumber(a); aNum {
		nb, bNum := asNumber(b)
		return bNum && na == nb
	}
	switch va := a.(type) {
	case string:
		vb, ok := b.(string)
		return ok && va == vb
	case nil:
		return b == nil
	}
	return false
}

// asNumber widens every numeric shape either side can arrive in to one type.
// Booleans are numbers here because SQLite has no boolean: the column holds
// 0 or 1, and the client sends true or false for the same field.
func asNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case bool:
		if n {
			return 1, true
		}
		return 0, true
	}
	return 0, false
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

// IsTruthy reports whether a field value carries a "yes". It accepts every
// shape one arrives in — a decoded JSON number is a float64, a scanned SQLite
// integer an int64 — so a caller never has to know which door the mutation
// came through.
func IsTruthy(v any) bool {
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
