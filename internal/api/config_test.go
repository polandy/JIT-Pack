package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// Sync-API §7 promises the G-3 lock staleness window as an
// environment-variable-configured default, which means the client has to
// be able to ask for it instead of carrying its own constant.

func getLockTimeout(t *testing.T, url string) int64 {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, url+"/api/v1/config", "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /config status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		LockTimeoutSeconds int64 `json:"lock_timeout_seconds"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out.LockTimeoutSeconds
}

func TestConfig_ServesTheFifteenMinuteLockTimeoutByDefault(t *testing.T) {
	srv := newTestServer(t)

	if got, want := getLockTimeout(t, srv.URL), int64(15*60); got != want {
		t.Fatalf("lock_timeout_seconds = %d, want %d (§7 shipped default)", got, want)
	}
}

func TestConfig_ServesTheOperatorConfiguredLockTimeout(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	s := api.New(st, testSecret)
	s.SetLockTimeout(90 * time.Second)
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)

	if got := getLockTimeout(t, srv.URL); got != 90 {
		t.Fatalf("lock_timeout_seconds = %d, want 90 (JITPACK_LOCK_TIMEOUT)", got)
	}
}

// Invariant 5: the endpoint answers in Single-User Mode too — the client
// asks for it before it knows which mode it is talking to.
func TestConfig_ServedInSingleUserMode(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	srv := httptest.NewServer(api.NewSingleUser(st, "local").Handler())
	t.Cleanup(srv.Close)

	if got, want := getLockTimeout(t, srv.URL), int64(15*60); got != want {
		t.Fatalf("lock_timeout_seconds = %d, want %d", got, want)
	}
}

// A non-positive value would mean "every lock is already stale", which
// disables G-3 by accident; the server refuses it rather than serving it.
func TestConfig_RejectsANonPositiveLockTimeout(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	s := api.New(st, testSecret)
	s.SetLockTimeout(0)
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)

	if got, want := getLockTimeout(t, srv.URL), int64(15*60); got != want {
		t.Fatalf("lock_timeout_seconds = %d, want the default %d back", got, want)
	}
}
