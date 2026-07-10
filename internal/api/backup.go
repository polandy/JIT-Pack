// backup.go — NFR-4.5 data endpoints (M17 data section) and the /me
// identity endpoint the client needs to address its own avatar and
// display-name resources.

package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

// handleMe returns the authenticated user's identity.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)
	name, err := s.store.UserDisplayName(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "display name lookup failed")
		return
	}
	// is_instance_admin tells the client whether to render the M20
	// entry point (FR-23.2); the admin endpoints enforce it regardless.
	admin, err := s.store.IsInstanceAdmin(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "admin lookup failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"user_id":           userID,
		"display_name":      name,
		"is_instance_admin": admin,
	})
}

// handleExportFull streams the NFR-4.5 versioned JSON backup, filtered
// to the requesting user's visibility.
func (s *Server) handleExportFull(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(string)
	export, err := s.store.ExportFull(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "export failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="jitpack-export.json"`)
	json.NewEncoder(w).Encode(export)
}

// handleExportTripCSV streams the flat per-trip packing-list dump
// (NFR-4.5) — deliberately not round-trippable, unlike the portable
// YAML export (FR-18.3).
func (s *Server) handleExportTripCSV(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	doc, err := s.store.ExportTrip(r.Context(), tripID, true)
	if err != nil {
		writeError(w, http.StatusNotFound, "trip_not_found", "trip not found")
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", tripID+".csv"))
	cw := csv.NewWriter(w)
	cw.Write([]string{"item", "category", "quantity", "packed_count", "mode", "traveler", "container"})
	for _, item := range doc.Items {
		packed := ""
		if item.PackedCount != nil {
			packed = strconv.Itoa(*item.PackedCount)
		}
		cw.Write([]string{
			item.Name, item.Category, item.Quantity, packed,
			item.Mode, item.Traveler, item.Container,
		})
	}
	cw.Flush()
}
