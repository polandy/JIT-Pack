package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/store"
	"net/http/httptest"
)

// FR-21.9: an amount is a number without a currency until the instance
// names one. The endpoint that carries the name is deliberately public and
// deliberately answers in every mode — Single-User has no session to
// present, and a screen that shows a value shows it before anybody logs in.

func instanceConfig(t *testing.T, srv *httptest.Server) api.InstanceConfigResponse {
	t.Helper()
	resp, err := http.Get(srv.URL + api.RouteInstanceConfig)
	if err != nil {
		t.Fatalf("GET %s: %v", api.RouteInstanceConfig, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var got api.InstanceConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return got
}

func TestInstanceConfig_NamesTheCurrencyTheOperatorSet(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	s := api.New(st, testSecret)
	s.SetCurrency("CHF")
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)

	if got := instanceConfig(t, srv).Currency; got != "CHF" {
		t.Errorf("currency = %q, want %q", got, "CHF")
	}
}

func TestInstanceConfig_EmptyWhenTheOperatorNamedNone(t *testing.T) {
	srv := newTestServer(t)

	if got := instanceConfig(t, srv).Currency; got != "" {
		t.Errorf("currency = %q, want empty — an unnamed currency is not a default one", got)
	}
}

// Invariant 5: Single-User Mode bypasses auth entirely, so a config the
// client needs must not sit behind a session. `/auth/config` answers 501
// there by design, which is exactly why it could not carry this.
func TestInstanceConfig_AnswersInSingleUserModeWithoutASession(t *testing.T) {
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	s := api.NewSingleUser(st, "local-user")
	s.SetCurrency("EUR")
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)

	if got := instanceConfig(t, srv).Currency; got != "EUR" {
		t.Errorf("currency = %q, want %q", got, "EUR")
	}
}
