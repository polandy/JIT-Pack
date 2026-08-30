package api

import "net/http"

// SetCurrency names the ISO-4217 currency this instance's amounts are in
// (FR-21.9). Empty leaves them unit-less. Like the other Set* options it
// is a startup-time choice made by cmd/jitpackd, never a per-request one.
func (s *Server) SetCurrency(code string) {
	s.currency = code
}

// handleInstanceConfig answers the settings the client renders with. It is
// unauthenticated on purpose: Single-User Mode presents no session at all
// (invariant 5), and the values here say nothing about any caller.
func (s *Server) handleInstanceConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, InstanceConfigResponse{Currency: s.currency})
}
