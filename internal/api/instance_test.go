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

	s := api.New(st, testSecret, api.Options{Currency: "CHF"})
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

	s := api.NewSingleUser(st, "local-user", api.Options{Currency: "EUR"})
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)

	if got := instanceConfig(t, srv).Currency; got != "EUR" {
		t.Errorf("currency = %q, want %q", got, "EUR")
	}
}

// FR-29.17: tiles are drawn unless the operator turned them off.
func TestInstanceConfig_MapTilesOnUnlessTurnedOff_FR29_17(t *testing.T) {
	if !instanceConfig(t, newTestServer(t)).MapTiles {
		t.Error("map_tiles = false by default, want true — tiles are on unless switched off")
	}

	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	srv := httptest.NewServer(api.New(st, testSecret, api.Options{NoMapTiles: true}).Handler())
	t.Cleanup(srv.Close)
	if instanceConfig(t, srv).MapTiles {
		t.Error("map_tiles = true with NoMapTiles, want false")
	}
}

// FR-29.19: the router a device asks is the one the operator configured,
// and none where routing is off.
func TestInstanceConfig_HandsOnTheRoutingURL_FR29_19(t *testing.T) {
	if got := instanceConfig(t, newTestServer(t)).RoutingURL; got != "" {
		t.Errorf("routing_url = %q without RoutingURL, want empty", got)
	}

	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	const router = "https://router.example/brouter"
	srv := httptest.NewServer(api.NewSingleUser(st, "local-user", api.Options{RoutingURL: router}).Handler())
	t.Cleanup(srv.Close)
	if got := instanceConfig(t, srv).RoutingURL; got != router {
		t.Errorf("routing_url = %q, want %q", got, router)
	}
}
