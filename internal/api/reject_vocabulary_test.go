package api

import (
	"os"
	"regexp"
	"sort"
	"testing"
)

// The refusal vocabulary is declared twice on purpose — once as
// `store.RejectReason`, once in client/src/sync/rejectionReasons.ts, because
// the *sentence* belongs to whoever renders it and only the client knows the
// user's language (Sync-API §5). Twice-declared and checked nowhere is how
// `outcome`/`status` survived for months (see pushcontract_test.go): a reason
// the client has no entry for is not a compile error, it is a rejection the
// user is told nothing about. Both sides are read from source here, so
// neither a new reason nor a renamed one can be half-landed.
func TestRejectReasons_ClientKnowsEveryOneTheServerCanSend(t *testing.T) {
	goReasons := matches(t, "../store/store.go", `RejectReason = "([a-z_]+)"`)
	tsReasons := matches(t, "../../client/src/sync/rejectionReasons.ts", `: '([a-z_]+)',`)

	if len(goReasons) < 2 {
		t.Fatalf("read %d reasons from store.go — the pattern stopped matching", len(goReasons))
	}
	for _, reason := range goReasons {
		if reason == "" { // ReasonNone is the zero value, not a refusal.
			continue
		}
		if !contains(tsReasons, reason) {
			t.Errorf("the server can refuse with %q and client/src/sync/rejectionReasons.ts "+
				"has no entry for it — the user would be told nothing. Known there: %v",
				reason, tsReasons)
		}
	}
	for _, reason := range tsReasons {
		if !contains(goReasons, reason) {
			t.Errorf("client/src/sync/rejectionReasons.ts carries %q, which no server reason "+
				"spells — copy for a refusal that cannot happen. Known here: %v", reason, goReasons)
		}
	}
}

func matches(t *testing.T, path, pattern string) []string {
	t.Helper()
	src, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var out []string
	for _, m := range regexp.MustCompile(pattern).FindAllStringSubmatch(string(src), -1) {
		if !contains(out, m[1]) {
			out = append(out, m[1])
		}
	}
	sort.Strings(out)
	return out
}
