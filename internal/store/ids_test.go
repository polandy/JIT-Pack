package store

import (
	"regexp"
	"testing"
)

var hex32 = regexp.MustCompile(`^[0-9a-f]{32}$`)

// The id is a primary key another device merges against (NFR-4.2a), so its
// shape is part of the contract and a repeat is silent data loss.
func TestRandomID_IsThirtyTwoHexDigitsAndDoesNotRepeat(t *testing.T) {
	seen := make(map[string]bool)
	for range 1000 {
		id := randomID()
		if !hex32.MatchString(id) {
			t.Fatalf("randomID() = %q, want 32 hex digits", id)
		}
		if seen[id] {
			t.Fatalf("randomID() repeated %q", id)
		}
		seen[id] = true
	}
}
