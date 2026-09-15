package api

import "testing"

// FR-23.8's one piece of arithmetic. The rule it has to hold in both
// directions: an unparsable tag is never newer, because "cannot compare"
// reaching a person as "there is an update" is the only failure here that
// costs anything.
func TestNewerVersion(t *testing.T) {
	for _, tc := range []struct {
		name    string
		current string
		latest  string
		want    bool
	}{
		{"a later patch", "v0.7.0", "v0.7.1", true},
		{"a later minor", "v0.7.0", "v0.8.0", true},
		{"a later major", "v0.7.0", "v1.0.0", true},
		{"ten is after nine", "v0.9.0", "v0.10.0", true},
		{"the same release", "v0.7.0", "v0.7.0", false},
		{"an older release", "v0.7.0", "v0.6.9", false},
		{"a tag without its v", "0.7.0", "0.8.0", true},
		{"a build after the release it describes", "v0.7.0-3-gabc1234", "v0.7.0", false},
		{"a build before the next release", "v0.7.0-3-gabc1234", "v0.8.0", true},
		{"an upstream tag nobody can parse", "v0.7.0", "nightly", false},
		{"an unversioned build", "dev", "v0.10.0", false},
		{"a two-part tag", "v0.7.0", "v0.8", false},
		{"a tag with a negative number", "v0.7.0", "v0.-8.0", false},
		{"no tag at all", "v0.7.0", "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := newerVersion(tc.current, tc.latest); got != tc.want {
				t.Errorf("newerVersion(%q, %q) = %v, want %v", tc.current, tc.latest, got, tc.want)
			}
		})
	}
}
