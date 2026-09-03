package api

import "net/http"

// handleInstanceConfig answers the settings the client renders with. It is
// unauthenticated on purpose: Single-User Mode presents no session at all
// (invariant 5), and the values here say nothing about any caller.
func (s *Server) handleInstanceConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, InstanceConfigResponse{Currency: s.currency})
}
