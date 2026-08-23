package api

import (
	"net/http"
	"time"
)

// DefaultLockTimeout is the shipped G-3 staleness window (Sync-API §7):
// a `packing_now` claim older than this is ignored, so a device that
// went offline mid-pack never holds a row hostage. Operators override it
// with JITPACK_LOCK_TIMEOUT.
const DefaultLockTimeout = 15 * time.Minute

// SetLockTimeout overrides the G-3 staleness window served to clients
// (Sync-API §7). A non-positive duration would mean "every lock is
// already stale", which switches G-3 off by accident, so it is ignored
// and the default stands.
func (s *Server) SetLockTimeout(d time.Duration) {
	if d <= 0 {
		return
	}
	s.lockTimeout = d
}

// lockTimeoutOrDefault resolves the configured window, tolerating the
// zero value a Server built without SetLockTimeout carries.
func (s *Server) lockTimeoutOrDefault() time.Duration {
	if s.lockTimeout <= 0 {
		return DefaultLockTimeout
	}
	return s.lockTimeout
}

// handleConfig serves the instance settings a client cannot know on its
// own. It is deliberately unauthenticated and mode-independent: it
// carries no per-user data, and the client needs the G-3 window in
// Single-User Mode too (invariant 5).
func (s *Server) handleConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"lock_timeout_seconds": int64(s.lockTimeoutOrDefault() / time.Second),
	})
}
