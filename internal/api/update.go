package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// defaultUpdateFeedURL is GitHub's own answer to "what is the newest
// release of this project". `releases/latest` excludes drafts and
// pre-releases, which is why the comparison below never has to.
const defaultUpdateFeedURL = "https://api.github.com/repos/polandy/JIT-Pack/releases/latest"

// How the check behaves against a service that is neither ours nor
// obliged to answer. The interval is a day because a release is not an
// hourly event and the endpoint is unauthenticated — GitHub allows 60
// requests an hour per IP, which one instance must never come near. The
// timeout is short because nothing waits on the answer: a settings
// screen renders either way.
const (
	updateCheckInterval = 24 * time.Hour
	updateCheckTimeout  = 5 * time.Second
	// updateFeedLimit caps what is decoded from a response this server
	// did not author, the way §9 caps every request body it reads.
	updateFeedLimit = 64 << 10
)

// versionParts is the number of dot-separated numbers a release tag
// carries: major, minor, patch.
const versionParts = 3

// githubRelease is the slice of GitHub's release payload this reads.
// Everything else in that document is ignored on purpose — a field this
// does not name cannot change what the instance reports.
type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

// updateChecker answers FR-23.8 from at most one upstream request a day.
// It is lazy rather than a background loop: an instance nobody asks is an
// instance that never contacts GitHub, which is the promise the opt-in
// makes.
type updateChecker struct {
	version string
	feedURL string
	now     func() time.Time
	client  *http.Client

	// mu is held across the upstream request as well as the state it
	// writes. That serializes concurrent callers behind one attempt,
	// which is the point: the alternative is every open settings screen
	// starting its own request against a rate-limited endpoint.
	mu sync.Mutex
	// attemptedAt is the last attempt, successful or not — a failing
	// network must not be retried on every request.
	attemptedAt time.Time
	// checkedAt is the last attempt that answered, and the age of
	// everything below it.
	checkedAt  time.Time
	latest     string
	releaseURL string
	failed     bool
}

// newUpdateChecker builds the checker for opts, or returns nil where this
// instance makes no check: the operator did not ask for one, or the build
// names no version a release could be compared against. A nil checker is
// the "off" state and not an error — see handleInstanceUpdate.
func newUpdateChecker(opts Options, now func() time.Time) *updateChecker {
	if !opts.UpdateCheck {
		return nil
	}
	if _, ok := parseVersion(opts.Version); !ok {
		return nil
	}
	feed := opts.UpdateFeedURL
	if feed == "" {
		feed = defaultUpdateFeedURL
	}
	return &updateChecker{
		version: opts.Version,
		feedURL: feed,
		now:     now,
		client:  &http.Client{Timeout: updateCheckTimeout},
	}
}

// state answers the current release situation, asking upstream first when
// the last attempt has aged out.
func (c *updateChecker) state(ctx context.Context) InstanceUpdateResponse {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	if c.attemptedAt.IsZero() || now.Sub(c.attemptedAt) >= updateCheckInterval {
		c.attemptedAt = now
		rel, err := c.fetch(ctx)
		c.failed = err != nil
		if err == nil {
			c.checkedAt = now
			c.latest = rel.TagName
			c.releaseURL = rel.HTMLURL
		}
	}

	resp := InstanceUpdateResponse{
		Current:    c.version,
		Latest:     c.latest,
		ReleaseURL: c.releaseURL,
	}
	if !c.checkedAt.IsZero() {
		resp.CheckedAt = c.checkedAt.UTC().Format(time.RFC3339)
	}
	switch {
	case newerVersion(c.version, c.latest):
		// Deliberately ahead of the failure below: a newer release known
		// from yesterday is still true today, and CheckedAt says so.
		resp.State = UpdateStateAvailable
	case c.failed:
		resp.State = UpdateStateUnreachable
	default:
		resp.State = UpdateStateCurrent
	}
	return resp
}

// fetch asks upstream once. Every failure is the same failure to the
// caller — what the instance can say is that it did not get an answer,
// and which kind it did not get changes nothing it renders.
func (c *updateChecker) fetch(ctx context.Context) (githubRelease, error) {
	ctx, cancel := context.WithTimeout(ctx, updateCheckTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.feedURL, nil)
	if err != nil {
		return githubRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	// GitHub refuses an API request that does not name its caller.
	req.Header.Set("User-Agent", "jitpackd/"+c.version)

	resp, err := c.client.Do(req)
	if err != nil {
		return githubRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return githubRelease{}, fmt.Errorf("update feed answered %s", resp.Status)
	}

	var rel githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, updateFeedLimit)).Decode(&rel); err != nil {
		return githubRelease{}, err
	}
	if rel.TagName == "" {
		return githubRelease{}, errors.New("update feed named no release")
	}
	return rel, nil
}

// newerVersion reports whether latest names a release after current. Both
// are tags as GitHub writes them ("v0.10.0").
//
// Anything that does not parse answers false, in both arguments: "cannot
// compare" must never reach a person as "there is an update". A tag with
// a suffix — the `v0.10.0-3-gabc1234` a local build describes itself as —
// is compared on its three numbers alone, so a build made after a release
// counts as that release rather than as something older.
func newerVersion(current, latest string) bool {
	c, ok := parseVersion(current)
	if !ok {
		return false
	}
	l, ok := parseVersion(latest)
	if !ok {
		return false
	}
	for i := range versionParts {
		if l[i] != c[i] {
			return l[i] > c[i]
		}
	}
	return false
}

// parseVersion reads the three numbers out of a release tag, with the
// leading "v" and any suffix optional.
func parseVersion(tag string) ([versionParts]int, bool) {
	var out [versionParts]int
	core := strings.TrimPrefix(strings.TrimSpace(tag), "v")
	if i := strings.IndexAny(core, "-+"); i >= 0 {
		core = core[:i]
	}
	fields := strings.Split(core, ".")
	if len(fields) != versionParts {
		return out, false
	}
	for i, f := range fields {
		n, err := strconv.Atoi(f)
		if err != nil || n < 0 {
			return out, false
		}
		out[i] = n
	}
	return out, true
}

// handleInstanceUpdate answers whether this instance is behind its
// upstream releases (FR-23.8). Unauthenticated like the instance config
// beside it: Single-User Mode presents no session (invariant 5), and the
// version it reports is the one the app bar already shows to anyone who
// loads the client.
func (s *Server) handleInstanceUpdate(w http.ResponseWriter, r *http.Request) {
	if s.update == nil {
		writeJSON(w, InstanceUpdateResponse{State: UpdateStateOff, Current: s.version})
		return
	}
	writeJSON(w, s.update.state(r.Context()))
}
