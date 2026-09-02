package sync

import "testing"

// IsTruthy decides whether an additive field carries a "yes" (NFR-4.2a
// rule 3). It is exported because internal/api asks the same question of the
// same field of the same mutation, and used to answer it with its own copy
// that had no int64 case.
func TestIsTruthy_AcceptsEveryShapeAFieldArrivesIn(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   any
		want bool
	}{
		{"bool true", true, true},
		{"bool false", false, false},
		{"int non-zero", 1, true},
		{"int zero", 0, false},
		{"int64 non-zero", int64(1), true},
		{"int64 zero", int64(0), false},
		{"float64 non-zero", 1.0, true},
		{"float64 zero", 0.0, false},
		{"string", "true", false},
		{"nil", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsTruthy(tc.in); got != tc.want {
				t.Fatalf("IsTruthy(%#v) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestMutationSet_CreatesTheFieldMapOnFirstWrite(t *testing.T) {
	m := &Mutation{}
	m.Set("state", StatePacked)
	if m.Fields["state"] != StatePacked {
		t.Fatalf("Fields = %#v, want state=%q", m.Fields, StatePacked)
	}
}

func TestMutationSet_KeepsTheFieldsAlreadyThere(t *testing.T) {
	m := &Mutation{Fields: map[string]any{"name": "Zelt"}}
	m.Set("packed_at", nil)
	if m.Fields["name"] != "Zelt" {
		t.Fatalf("Set dropped an existing field: %#v", m.Fields)
	}
	v, ok := m.Fields["packed_at"]
	if !ok || v != nil {
		t.Fatalf("Set did not write a nil value: %#v", m.Fields)
	}
}
