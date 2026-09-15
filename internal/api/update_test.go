package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// FR-23.8: an instance can say whether a newer release exists upstream —
// but only when its operator asked it to, and only in words a person can
// act on. The upstream feed is a fake here, so every state below is driven
// rather than waited for.

// thisBuild is the version the fake instances in this file were built as.
const thisBuild = "v0.7.0"

// fakeFeed stands in for GitHub's releases/latest, counting what it was
// asked so a test can assert the instance does not ask twice in a day.
type fakeFeed struct {
	srv    *httptest.Server
	calls  atomic.Int64
	status atomic.Int64
	tag    atomic.Value // string
	// link overrides the release's own URL; empty means the ordinary
	// GitHub one built from the tag.
	link atomic.Value // string
}

func newFakeFeed(t *testing.T, tag string) *fakeFeed {
	t.Helper()
	f := &fakeFeed{}
	f.status.Store(int64(http.StatusOK))
	f.tag.Store(tag)
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		f.calls.Add(1)
		if code := int(f.status.Load()); code != http.StatusOK {
			w.WriteHeader(code)
			return
		}
		release := f.tag.Load().(string)
		link, _ := f.link.Load().(string)
		if link == "" {
			link = "https://github.com/polandy/JIT-Pack/releases/tag/" + release
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{
			"tag_name": release,
			"html_url": link,
		}); err != nil {
			t.Errorf("encode release: %v", err)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

// testClock is the server's clock (G-4), advanced by the test rather than
// by waiting: the check's whole contract is what it does a day later.
type testClock struct{ at atomic.Value }

func newTestClock(at time.Time) *testClock {
	c := &testClock{}
	c.at.Store(at)
	return c
}

func (c *testClock) now() time.Time          { return c.at.Load().(time.Time) }
func (c *testClock) advance(d time.Duration) { c.at.Store(c.now().Add(d)) }

// updateServer starts an instance with opts, filling in the store and the
// pieces every case here shares.
func updateServer(t *testing.T, opts api.Options) *httptest.Server {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	srv := httptest.NewServer(api.New(st, testSecret, opts).Handler())
	t.Cleanup(srv.Close)
	return srv
}

func instanceUpdate(t *testing.T, srv *httptest.Server) api.InstanceUpdateResponse {
	t.Helper()
	resp, err := http.Get(srv.URL + api.RouteInstanceUpdate)
	if err != nil {
		t.Fatalf("GET %s: %v", api.RouteInstanceUpdate, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var got api.InstanceUpdateResponse
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return got
}

func TestInstanceUpdate_OffUntilTheOperatorTurnsItOn(t *testing.T) {
	feed := newFakeFeed(t, "v0.10.0")
	srv := updateServer(t, api.Options{Version: thisBuild, UpdateFeedURL: feed.srv.URL})

	if got := instanceUpdate(t, srv).State; got != api.UpdateStateOff {
		t.Errorf("state = %q, want %q — the check is opt-in", got, api.UpdateStateOff)
	}
	// The positive signal for the absence: the feed records every call it
	// is asked for, and an instance nobody configured asks it nothing.
	if n := feed.calls.Load(); n != 0 {
		t.Errorf("upstream calls = %d, want 0 — an instance that was not asked to check must not contact GitHub", n)
	}
}

func TestInstanceUpdate_OffWhenTheBuildNamesNoVersion(t *testing.T) {
	feed := newFakeFeed(t, "v0.10.0")
	srv := updateServer(t, api.Options{
		Version: "dev", UpdateCheck: true, UpdateFeedURL: feed.srv.URL,
	})

	if got := instanceUpdate(t, srv).State; got != api.UpdateStateOff {
		t.Errorf("state = %q, want %q — a build with no release tag has nothing to compare", got, api.UpdateStateOff)
	}
	if n := feed.calls.Load(); n != 0 {
		t.Errorf("upstream calls = %d, want 0 — nothing can be concluded from the answer", n)
	}
}

func TestInstanceUpdate_AvailableWhenUpstreamIsNewer(t *testing.T) {
	feed := newFakeFeed(t, "v0.10.0")
	clock := newTestClock(time.Date(2026, 9, 14, 4, 12, 0, 0, time.UTC))
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL, Now: clock.now,
	})

	got := instanceUpdate(t, srv)
	if got.State != api.UpdateStateAvailable {
		t.Fatalf("state = %q, want %q", got.State, api.UpdateStateAvailable)
	}
	if got.Latest != "v0.10.0" {
		t.Errorf("latest = %q, want %q", got.Latest, "v0.10.0")
	}
	if got.ReleaseURL != "https://github.com/polandy/JIT-Pack/releases/tag/v0.10.0" {
		t.Errorf("release_url = %q — the answer to a newer version is what changed in it", got.ReleaseURL)
	}
	if got.Current != thisBuild {
		t.Errorf("current = %q, want %q", got.Current, thisBuild)
	}
	if want := "2026-09-14T04:12:00Z"; got.CheckedAt != want {
		t.Errorf("checked_at = %q, want %q", got.CheckedAt, want)
	}
}

func TestInstanceUpdate_CurrentWhenUpstreamIsThisBuild(t *testing.T) {
	feed := newFakeFeed(t, thisBuild)
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL,
	})

	if got := instanceUpdate(t, srv).State; got != api.UpdateStateCurrent {
		t.Errorf("state = %q, want %q", got, api.UpdateStateCurrent)
	}
}

// An older tag upstream is not a downgrade prompt: a release can be
// deleted or a pre-release yanked, and neither means this instance is
// behind.
func TestInstanceUpdate_CurrentWhenUpstreamIsOlder(t *testing.T) {
	feed := newFakeFeed(t, "v0.6.9")
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL,
	})

	if got := instanceUpdate(t, srv).State; got != api.UpdateStateCurrent {
		t.Errorf("state = %q, want %q", got, api.UpdateStateCurrent)
	}
}

func TestInstanceUpdate_UnreachableWhenUpstreamDoesNotAnswer(t *testing.T) {
	feed := newFakeFeed(t, "v0.10.0")
	feed.status.Store(int64(http.StatusServiceUnavailable))
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL,
	})

	got := instanceUpdate(t, srv)
	if got.State != api.UpdateStateUnreachable {
		t.Errorf("state = %q, want %q", got.State, api.UpdateStateUnreachable)
	}
	if got.CheckedAt != "" {
		t.Errorf("checked_at = %q, want empty — no answer has ever arrived", got.CheckedAt)
	}
}

// The rule the wire vocabulary states: a newer release known from
// yesterday outranks today's failure, because checked_at already says how
// old the knowledge is and withdrawing it would be less true.
func TestInstanceUpdate_KeepsAKnownReleaseWhenALaterCheckFails(t *testing.T) {
	feed := newFakeFeed(t, "v0.10.0")
	start := time.Date(2026, 9, 14, 4, 12, 0, 0, time.UTC)
	clock := newTestClock(start)
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL, Now: clock.now,
	})

	if got := instanceUpdate(t, srv).State; got != api.UpdateStateAvailable {
		t.Fatalf("first state = %q, want %q", got, api.UpdateStateAvailable)
	}

	feed.status.Store(int64(http.StatusServiceUnavailable))
	clock.advance(updateCheckDay)

	got := instanceUpdate(t, srv)
	if got.State != api.UpdateStateAvailable {
		t.Errorf("state = %q, want %q — the release did not stop existing", got.State, api.UpdateStateAvailable)
	}
	if want := start.Format(time.RFC3339); got.CheckedAt != want {
		t.Errorf("checked_at = %q, want %q — the age of the answer is what the failure changes", got.CheckedAt, want)
	}
}

// The rate limit is the reason the interval exists: the endpoint allows 60
// unauthenticated requests an hour per IP, and every open settings screen
// would otherwise spend one.
func TestInstanceUpdate_AsksUpstreamOnceADay(t *testing.T) {
	feed := newFakeFeed(t, "v0.10.0")
	clock := newTestClock(time.Date(2026, 9, 14, 4, 12, 0, 0, time.UTC))
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL, Now: clock.now,
	})

	instanceUpdate(t, srv)
	clock.advance(updateCheckDay - time.Minute)
	instanceUpdate(t, srv)
	if n := feed.calls.Load(); n != 1 {
		t.Fatalf("upstream calls within a day = %d, want 1", n)
	}

	clock.advance(2 * time.Minute)
	instanceUpdate(t, srv)
	if n := feed.calls.Load(); n != 2 {
		t.Errorf("upstream calls after a day = %d, want 2 — the answer ages out", n)
	}
}

// The link is rendered as an href, and it comes from off the network. A
// scheme a browser would execute must never reach the screen — and the
// version, which is the useful half, survives losing it.
func TestInstanceUpdate_DropsAReleaseLinkThatIsNotAWebURL(t *testing.T) {
	for _, tc := range []struct {
		name string
		link string
		want string
	}{
		{name: "a javascript url", link: "javascript:alert(1)", want: ""},
		{name: "plain http", link: "http://example.test/r/v0.10.0", want: ""},
		{name: "a relative path", link: "/polandy/JIT-Pack/releases", want: ""},
		{
			name: "the ordinary release page",
			link: "https://github.com/polandy/JIT-Pack/releases/tag/v0.10.0",
			want: "https://github.com/polandy/JIT-Pack/releases/tag/v0.10.0",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			feed := newFakeFeed(t, "v0.10.0")
			feed.link.Store(tc.link)
			srv := updateServer(t, api.Options{
				Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL,
			})

			got := instanceUpdate(t, srv)
			if got.ReleaseURL != tc.want {
				t.Errorf("release_url = %q, want %q", got.ReleaseURL, tc.want)
			}
			// The release itself is still reported: dropping the link must
			// not drop the answer.
			if got.State != api.UpdateStateAvailable || got.Latest != "v0.10.0" {
				t.Errorf("state = %q, latest = %q — the version survives a bad link", got.State, got.Latest)
			}
		})
	}
}

// A tag nobody can parse must not read as an update: "cannot compare" and
// "you are behind" are different sentences.
func TestInstanceUpdate_CurrentWhenUpstreamNamesNoComparableTag(t *testing.T) {
	feed := newFakeFeed(t, "nightly")
	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.srv.URL,
	})

	if got := instanceUpdate(t, srv).State; got != api.UpdateStateCurrent {
		t.Errorf("state = %q, want %q", got, api.UpdateStateCurrent)
	}
}

// updateCheckDay mirrors the unexported interval the checker uses. It is
// spelled out rather than exported: the test asserts the behaviour the
// operator was promised — one request a day — not a constant's identity.
const updateCheckDay = 24 * time.Hour

// A check belongs to the instance, not to the browser that happened to
// trigger it: the answer is cached for every later caller. A device that
// navigates away mid-flight would otherwise cancel the attempt, record a
// failure, and leave the instance reporting `unreachable` for a day.
func TestInstanceUpdate_SurvivesTheCallerThatTriggeredIt(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		close(entered)
		// Held until the test has cancelled the request that started it,
		// so the cancellation lands while the upstream call is in flight —
		// a moment, driven, rather than a race waited on.
		<-release
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{
			"tag_name": "v0.10.0",
			"html_url": "https://github.com/polandy/JIT-Pack/releases/tag/v0.10.0",
		}); err != nil {
			t.Errorf("encode release: %v", err)
		}
	}))
	t.Cleanup(feed.Close)

	srv := updateServer(t, api.Options{
		Version: thisBuild, UpdateCheck: true, UpdateFeedURL: feed.URL,
	})

	ctx, cancel := context.WithCancel(context.Background())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+api.RouteInstanceUpdate, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		//nolint:bodyclose // the response never arrives: this call is cancelled on purpose.
		if _, err := http.DefaultClient.Do(req); err == nil {
			t.Error("the cancelled request answered — the case drives the wrong moment")
		}
	}()

	<-entered
	cancel()
	<-done
	close(release)

	// The second caller is the positive signal: it sees the answer the
	// first one paid for, and the feed was asked exactly once.
	got := instanceUpdate(t, srv)
	if got.State != api.UpdateStateAvailable {
		t.Errorf("state = %q, want %q — the abandoned attempt still landed", got.State, api.UpdateStateAvailable)
	}
	if n := calls.Load(); n != 1 {
		t.Errorf("upstream calls = %d, want 1", n)
	}
}
