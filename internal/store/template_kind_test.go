package store

import (
	"testing"

	"jitpack/internal/sync"
)

// The FR-27.1 two-level rule is only as strong as `templates.kind` is
// stable. These tests state the reproduction that made it reachable and
// the two FR-27.6 guards that close it.

func seedTemplate(t *testing.T, s *Store, id, kind, mutationID string) {
	t.Helper()
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, id, mutationID,
		map[string]any{"name": id, "kind": kind}, "0000000001000-0000-aaaaaaaa"))
}

func flipKind(t *testing.T, s *Store, id, kind, mutationID, hlc string) sync.Outcome {
	t.Helper()
	return applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTemplates, id, mutationID,
		map[string]any{"kind": kind}, hlc)).Outcome
}

func include(t *testing.T, s *Store, parent, child, mutationID, hlc string) sync.Outcome {
	t.Helper()
	return applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplateIncludes,
		"inc-"+mutationID, mutationID,
		map[string]any{"template_id": parent, "included_template_id": child}, hlc)).Outcome
}

// FR-27.1 claims the two-level hierarchy makes include cycles
// structurally impossible. It only does so while a template cannot change
// scope underneath its edges: with the kinds swapped, `validInclude` reads
// the reversed edge as legal and A -> B -> A is persisted.
func TestApplyMasterMutation_KindFlipCannotBuildAnIncludeCycle(t *testing.T) {
	s := openTestStore(t)
	seedTemplate(t, s, "tpl-a", KindTemplate, "kf-a")
	seedTemplate(t, s, "tpl-b", KindGroup, "kf-b")

	if got := include(t, s, "tpl-a", "tpl-b", "kf-1", "0000000002000-0000-aaaaaaaa"); got != sync.OutcomeApplied {
		t.Fatalf("A includes B: outcome = %q, want applied", got)
	}
	if got := flipKind(t, s, "tpl-a", KindGroup, "kf-2", "0000000002001-0000-aaaaaaaa"); got != sync.OutcomeRejected {
		t.Errorf("demoting a Vorlage that still includes a group: outcome = %q, want rejected (FR-27.6)", got)
	}
	if got := flipKind(t, s, "tpl-b", KindTemplate, "kf-3", "0000000002002-0000-aaaaaaaa"); got != sync.OutcomeRejected {
		t.Errorf("promoting an included group: outcome = %q, want rejected (FR-27.6)", got)
	}
	if got := include(t, s, "tpl-b", "tpl-a", "kf-4", "0000000002003-0000-aaaaaaaa"); got != sync.OutcomeRejected {
		t.Errorf("reversed edge: outcome = %q, want rejected", got)
	}

	// The positive signal the "no cycle" claim is asserted against: the
	// edge table itself, which must still hold exactly the one edge.
	var edges int
	if err := s.db.QueryRow(
		`SELECT count(*) FROM template_includes WHERE template_id = 'tpl-b' AND included_template_id = 'tpl-a'`).
		Scan(&edges); err != nil {
		t.Fatal(err)
	}
	if edges != 0 {
		t.Errorf("cycle edge B->A persisted %d time(s); FR-27.1 says cycles are impossible", edges)
	}
}

// FR-27.6's two guards, each on its own and in the shapes that must stay
// allowed: an unused template flips freely, and so does an unused group.
func TestApplyMasterMutation_KindSwitchGuards(t *testing.T) {
	s := openTestStore(t)
	seedTemplate(t, s, "free-tpl", KindTemplate, "ks-a")
	seedTemplate(t, s, "free-grp", KindGroup, "ks-b")
	seedTemplate(t, s, "used-tpl", KindTemplate, "ks-c")
	seedTemplate(t, s, "used-grp", KindGroup, "ks-d")
	if got := include(t, s, "used-tpl", "used-grp", "ks-1", "0000000002000-0000-aaaaaaaa"); got != sync.OutcomeApplied {
		t.Fatalf("seed include: outcome = %q, want applied", got)
	}

	tests := []struct {
		name, id, kind, hlc string
		want                sync.Outcome
	}{
		{"a Vorlage including nothing may become a Gruppe", "free-tpl", KindGroup, "0000000003000-0000-aaaaaaaa", sync.OutcomeApplied},
		{"a Gruppe nobody includes may be promoted", "free-grp", KindTemplate, "0000000003001-0000-aaaaaaaa", sync.OutcomeApplied},
		{"a Vorlage that still includes groups may not become a Gruppe", "used-tpl", KindGroup, "0000000003002-0000-aaaaaaaa", sync.OutcomeRejected},
		{"a Gruppe that is included somewhere may not be promoted", "used-grp", KindTemplate, "0000000003003-0000-aaaaaaaa", sync.OutcomeRejected},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := flipKind(t, s, tt.id, tt.kind, "ks-m-"+tt.id, tt.hlc); got != tt.want {
				t.Errorf("outcome = %q, want %q", got, tt.want)
			}
			var kind string
			if err := s.db.QueryRow(`SELECT kind FROM templates WHERE id = ?`, tt.id).Scan(&kind); err != nil {
				t.Fatal(err)
			}
			stored := tt.kind
			if tt.want == sync.OutcomeRejected {
				stored = otherKind(tt.kind)
			}
			if kind != stored {
				t.Errorf("stored kind = %q, want %q", kind, stored)
			}
		})
	}
}

func otherKind(k string) string {
	if k == KindGroup {
		return KindTemplate
	}
	return KindGroup
}

// A mutation that does not carry `kind` must not be read as a flip: an
// offline rename of an included group is legitimate and losing it would
// cost more than the invariant (NFR-4.2a).
func TestApplyMasterMutation_RenameOfAnIncludedGroupStillApplies(t *testing.T) {
	s := openTestStore(t)
	seedTemplate(t, s, "ren-tpl", KindTemplate, "rn-a")
	seedTemplate(t, s, "ren-grp", KindGroup, "rn-b")
	if got := include(t, s, "ren-tpl", "ren-grp", "rn-1", "0000000002000-0000-aaaaaaaa"); got != sync.OutcomeApplied {
		t.Fatalf("seed include: outcome = %q, want applied", got)
	}
	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTemplates, "ren-grp", "rn-2",
		map[string]any{"name": "Sommer neu"}, "0000000002001-0000-aaaaaaaa"))
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("rename outcome = %q, want applied", res.Outcome)
	}
	var name string
	if err := s.db.QueryRow(`SELECT name FROM templates WHERE id = 'ren-grp'`).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Sommer neu" {
		t.Errorf("name = %q, want the pushed rename", name)
	}
}

// A no-op restatement of the current kind is not a flip either: an offline
// device replaying the whole row must not be rejected.
func TestApplyMasterMutation_RestatingTheSameKindIsNotAFlip(t *testing.T) {
	s := openTestStore(t)
	seedTemplate(t, s, "same-tpl", KindTemplate, "sm-a")
	seedTemplate(t, s, "same-grp", KindGroup, "sm-b")
	if got := include(t, s, "same-tpl", "same-grp", "sm-1", "0000000002000-0000-aaaaaaaa"); got != sync.OutcomeApplied {
		t.Fatalf("seed include: outcome = %q, want applied", got)
	}
	if got := flipKind(t, s, "same-grp", KindGroup, "sm-2", "0000000002001-0000-aaaaaaaa"); got == sync.OutcomeRejected {
		t.Errorf("restating kind 'group' on an included group was rejected; only a *change* is guarded")
	}
}
