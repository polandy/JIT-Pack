// Package sync implements the offline-sync primitives of the JIT-Pack
// protocol: hybrid logical clocks (Sync-API Spec §3) and the server-side
// merge algorithm (Sync-API Spec §6, NFR-4.2a).
package sync

import (
	"fmt"
	"strconv"
	stdsync "sync"
)

// HLC is a hybrid logical clock rendered as a fixed-width string
// "{physical_ms:013d}-{counter:04x}-{device_id:8}" so that lexicographic
// order equals causal order (Sync-API Spec §3).
type HLC string

const (
	hlcLen       = 13 + 1 + 4 + 1 + 8
	deviceIDLen  = 8
	counterLimit = 0xffff
)

// Clock abstracts wall time so HLC behavior is deterministic in tests.
type Clock interface {
	NowMillis() int64
}

// Generator produces strictly increasing HLCs for one device and folds
// observed remote clocks into its own notion of "now".
type Generator struct {
	mu         stdsync.Mutex
	clock      Clock
	deviceID   string
	lastMillis int64
	counter    int
}

// NewGenerator validates the device id (8 lowercase hex characters,
// random per installation) and returns a ready Generator.
func NewGenerator(clock Clock, deviceID string) (*Generator, error) {
	if len(deviceID) != deviceIDLen || !isLowerHex(deviceID) {
		return nil, fmt.Errorf("device id must be %d lowercase hex chars, got %q", deviceIDLen, deviceID)
	}
	return &Generator{clock: clock, deviceID: deviceID}, nil
}

// Next returns an HLC strictly greater than every HLC this generator has
// produced or observed, even if the wall clock stalls or moves backwards.
func (g *Generator) Next() HLC {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := g.clock.NowMillis()
	if now <= g.lastMillis {
		g.counter++
		if g.counter > counterLimit {
			g.lastMillis++
			g.counter = 0
		}
	} else {
		g.lastMillis = now
		g.counter = 0
	}
	return format(g.lastMillis, g.counter, g.deviceID)
}

// Observe advances the generator past a remote HLC seen in a pull or
// push response (Sync-API Spec §3).
func (g *Generator) Observe(remote HLC) error {
	millis, counter, _, err := Parse(remote)
	if err != nil {
		return err
	}
	g.mu.Lock()
	defer g.mu.Unlock()

	switch {
	case millis > g.lastMillis:
		g.lastMillis, g.counter = millis, counter
	case millis == g.lastMillis && counter > g.counter:
		g.counter = counter
	}
	return nil
}

// Parse splits an HLC into its components and validates the format.
func Parse(h HLC) (millis int64, counter int, deviceID string, err error) {
	s := string(h)
	if len(s) != hlcLen || s[13] != '-' || s[18] != '-' {
		return 0, 0, "", fmt.Errorf("malformed HLC %q", h)
	}
	millis, err = strconv.ParseInt(s[:13], 10, 64)
	if err != nil {
		return 0, 0, "", fmt.Errorf("malformed HLC millis in %q: %w", h, err)
	}
	counter64, err := strconv.ParseUint(s[14:18], 16, 32)
	if err != nil {
		return 0, 0, "", fmt.Errorf("malformed HLC counter in %q: %w", h, err)
	}
	counter = int(counter64)
	deviceID = s[19:]
	if !isLowerHex(deviceID) {
		return 0, 0, "", fmt.Errorf("malformed HLC device id in %q", h)
	}
	return millis, counter, deviceID, nil
}

func format(millis int64, counter int, deviceID string) HLC {
	return HLC(fmt.Sprintf("%013d-%04x-%s", millis, counter, deviceID))
}

func isLowerHex(s string) bool {
	for _, r := range s {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return len(s) > 0
}
