package sync

import (
	"strings"
	"testing"
)

// fakeClock makes HLC behavior deterministic per CODING_PRINCIPLES §2:
// no real time in tests.
type fakeClock struct{ millis int64 }

func (c *fakeClock) NowMillis() int64 { return c.millis }

func newTestGenerator(t *testing.T, clock Clock) *Generator {
	t.Helper()
	g, err := NewGenerator(clock, "a1b2c3d4")
	if err != nil {
		t.Fatalf("NewGenerator: %v", err)
	}
	return g
}

func TestNewGenerator_RejectsInvalidDeviceID(t *testing.T) {
	cases := []struct {
		name     string
		deviceID string
	}{
		{"empty", ""},
		{"too short", "a1b2"},
		{"too long", "a1b2c3d4e5"},
		{"non hex", "zzzzzzzz"},
		{"uppercase", "A1B2C3D4"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewGenerator(&fakeClock{}, tc.deviceID); err == nil {
				t.Errorf("expected error for device id %q, got nil", tc.deviceID)
			}
		})
	}
}

// Spec §3 of the Sync-API: "{physical_ms:013d}-{counter:04x}-{device_id:8}".
func TestGenerator_Next_ProducesFixedWidthParsableHLC(t *testing.T) {
	g := newTestGenerator(t, &fakeClock{millis: 1783862400123})

	h := g.Next()

	if got, want := len(string(h)), 27; got != want {
		t.Fatalf("HLC length = %d, want %d (%q)", got, want, h)
	}
	if !strings.HasPrefix(string(h), "1783862400123-0000-a1b2c3d4") {
		t.Errorf("unexpected HLC %q", h)
	}
	millis, counter, device, err := Parse(h)
	if err != nil {
		t.Fatalf("Parse(%q): %v", h, err)
	}
	if millis != 1783862400123 || counter != 0 || device != "a1b2c3d4" {
		t.Errorf("Parse(%q) = (%d, %d, %q)", h, millis, counter, device)
	}
}

func TestGenerator_Next_CounterIncrementsWhileClockStalls(t *testing.T) {
	clock := &fakeClock{millis: 1000}
	g := newTestGenerator(t, clock)

	first, second, third := g.Next(), g.Next(), g.Next()

	if !(first < second && second < third) {
		t.Errorf("HLCs not strictly increasing: %q, %q, %q", first, second, third)
	}
	if _, counter, _, _ := Parse(third); counter != 2 {
		t.Errorf("counter = %d, want 2", counter)
	}
}

func TestGenerator_Next_CounterResetsWhenClockAdvances(t *testing.T) {
	clock := &fakeClock{millis: 1000}
	g := newTestGenerator(t, clock)
	g.Next()
	g.Next()

	clock.millis = 2000
	h := g.Next()

	millis, counter, _, _ := Parse(h)
	if millis != 2000 || counter != 0 {
		t.Errorf("got (millis=%d, counter=%d), want (2000, 0)", millis, counter)
	}
}

// NFR-4.2a: causal order must survive devices with drifting wall clocks.
func TestGenerator_Next_NeverGoesBackwardsWhenWallClockDoes(t *testing.T) {
	clock := &fakeClock{millis: 5000}
	g := newTestGenerator(t, clock)
	before := g.Next()

	clock.millis = 3000 // wall clock jumps backwards
	after := g.Next()

	if !(before < after) {
		t.Errorf("HLC went backwards: %q then %q", before, after)
	}
}

// Spec §3: on every pull/push response the client advances past the
// maximum observed remote HLC.
func TestGenerator_Observe_NextExceedsRemoteFromTheFuture(t *testing.T) {
	clock := &fakeClock{millis: 1000}
	g := newTestGenerator(t, clock)
	remote := HLC("0000000009000-0005-deadbeef")

	if err := g.Observe(remote); err != nil {
		t.Fatalf("Observe: %v", err)
	}
	h := g.Next()

	if !(remote < h) {
		t.Errorf("Next() = %q, want > observed remote %q", h, remote)
	}
	millis, counter, _, _ := Parse(h)
	if millis != 9000 || counter != 6 {
		t.Errorf("got (millis=%d, counter=%d), want (9000, 6)", millis, counter)
	}
}

func TestGenerator_Observe_RejectsMalformedHLC(t *testing.T) {
	g := newTestGenerator(t, &fakeClock{millis: 1000})
	if err := g.Observe(HLC("not-an-hlc")); err == nil {
		t.Error("expected error for malformed HLC, got nil")
	}
}

// Lexicographic comparison is the protocol's ordering primitive; the
// device id must only ever break exact ties.
func TestHLC_LexicographicOrderMatchesCausalOrder(t *testing.T) {
	ordered := []HLC{
		"0000000001000-0000-bbbbbbbb",
		"0000000001000-0001-aaaaaaaa",
		"0000000001000-0001-cccccccc", // same instant, device breaks tie
		"0000000002000-0000-aaaaaaaa",
	}
	for i := 0; i < len(ordered)-1; i++ {
		if !(ordered[i] < ordered[i+1]) {
			t.Errorf("expected %q < %q", ordered[i], ordered[i+1])
		}
	}
}

// A client's HLC is a claim about ordering, and lexicographic order is the
// whole merge rule (§6): a string outside the format sorts wherever its
// bytes fall, so `"~"` outranks every real clock and the row it lands on can
// never be edited again. NFR-4.2a.
func TestValid_RejectsAnythingThatIsNotACanonicalHLC(t *testing.T) {
	cases := []struct {
		name string
		hlc  HLC
		want bool
	}{
		{"generated", HLC("1783862400123-000f-a1b2c3d4"), true},
		{"empty", HLC(""), false},
		{"above every real clock", HLC("~"), false},
		{"padded to the right length", HLC("~~~~~~~~~~~~~~~~~~~~~~~~~~~"), false},
		{"too short", HLC("1783862400123-000f-a1b2c3d"), false},
		{"too long", HLC("1783862400123-000f-a1b2c3d40"), false},
		{"separators moved", HLC("1783862400123x000f-a1b2c3d4"), false},
		{"millis not a number", HLC("17838624001x3-000f-a1b2c3d4"), false},
		{"millis signed", HLC("+783862400123-000f-a1b2c3d4"), false},
		{"counter not hex", HLC("1783862400123-00zf-a1b2c3d4"), false},
		{"counter uppercase", HLC("1783862400123-000F-a1b2c3d4"), false},
		{"device id uppercase", HLC("1783862400123-000f-A1B2C3D4"), false},
		{"device id not hex", HLC("1783862400123-000f-zzzzzzzz"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Valid(tc.hlc); got != tc.want {
				t.Errorf("Valid(%q) = %v, want %v", tc.hlc, got, tc.want)
			}
		})
	}
}

// Whatever the generator produces is by definition acceptable — the check
// and the format are one decision, not two that have to be kept equal.
func TestValid_AcceptsEveryClockTheGeneratorProduces(t *testing.T) {
	clock := &fakeClock{millis: 1}
	g := newTestGenerator(t, clock)
	for i := 0; i < 32; i++ {
		clock.millis += int64(i % 2)
		if h := g.Next(); !Valid(h) {
			t.Fatalf("Valid(%q) = false for a generated clock", h)
		}
	}
}
