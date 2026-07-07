package sync

import "testing"

// Edge cases closing the branches the primary specification tests leave
// open (CODING_PRINCIPLES §2: uncovered merge/HLC branches fail review).

func TestGenerator_Next_CounterOverflowRollsIntoNextMillisecond(t *testing.T) {
	clock := &fakeClock{millis: 1000}
	g := newTestGenerator(t, clock)

	var last HLC
	for i := 0; i <= counterLimit+1; i++ {
		last = g.Next()
	}

	millis, counter, _, err := Parse(last)
	if err != nil {
		t.Fatalf("Parse(%q): %v", last, err)
	}
	if millis != 1001 || counter != 0 {
		t.Errorf("after overflow got (millis=%d, counter=%d), want (1001, 0)", millis, counter)
	}
}

func TestGenerator_Observe_SameInstantTakesHigherCounter(t *testing.T) {
	clock := &fakeClock{millis: 1000}
	g := newTestGenerator(t, clock)
	g.Next() // local now at 1000-0000

	if err := g.Observe(HLC("0000000001000-0007-deadbeef")); err != nil {
		t.Fatalf("Observe: %v", err)
	}
	h := g.Next()

	if _, counter, _, _ := Parse(h); counter != 8 {
		t.Errorf("counter = %d, want 8 (advance past remote counter at same instant)", counter)
	}
}

func TestGenerator_Observe_RemoteBehindIsIgnored(t *testing.T) {
	clock := &fakeClock{millis: 5000}
	g := newTestGenerator(t, clock)
	before := g.Next()

	if err := g.Observe(HLC("0000000001000-0009-deadbeef")); err != nil {
		t.Fatalf("Observe: %v", err)
	}
	after := g.Next()

	if !(before < after) {
		t.Errorf("HLC regressed after observing older remote: %q then %q", before, after)
	}
	millis, _, _, _ := Parse(after)
	if millis != 5000 {
		t.Errorf("millis = %d, want 5000 (remote in the past must not rewind)", millis)
	}
}

func TestParse_RejectsMalformedComponents(t *testing.T) {
	cases := []struct {
		name string
		h    HLC
	}{
		{"wrong length", "123-0000-a1b2c3d4"},
		{"missing first separator", "0000000001000x0000-a1b2c3d4"},
		{"missing second separator", "0000000001000-0000xa1b2c3d4"},
		{"non-numeric millis", "000000000100x-0000-a1b2c3d4"},
		{"non-hex counter", "0000000001000-zzzz-a1b2c3d4"},
		{"non-hex device", "0000000001000-0000-ZZZZZZZZ"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, _, err := Parse(tc.h); err == nil {
				t.Errorf("Parse(%q) = nil error, want failure", tc.h)
			}
		})
	}
}

func TestMerge_AdditiveFlagVariants_TruthyEncodings(t *testing.T) {
	cases := []struct {
		name      string
		value     any
		wantApply bool
	}{
		{"int one", 1, true},
		{"int64 one", int64(1), true},
		{"float64 one (JSON number)", float64(1), true},
		{"bool true", true, true},
		{"int zero is not additive", 0, false},
		{"bool false is not additive", false, false},
		{"string is never truthy", "1", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := Mutation{Op: OpUpsert, Fields: map[string]any{"flag_unused": tc.value}, HLC: olderHLC}
			res := Merge(openItem(), rowHLC, true, m)
			_, applied := res.Applied["flag_unused"]
			if applied != tc.wantApply {
				t.Errorf("flag_unused=%v (%T): applied=%v, want %v", tc.value, tc.value, applied, tc.wantApply)
			}
		})
	}
}
