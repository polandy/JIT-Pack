package api

import (
	"database/sql"
	"errors"
	"net/http"

	"jitpack/internal/portable"
)

func (s *Server) handleExportTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateID")
	doc, err := s.store.ExportTemplate(r.Context(), templateID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "not_found", "template not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "export failed")
		return
	}
	data, err := portable.Marshal(doc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "marshal failed")
		return
	}
	w.Header().Set("Content-Type", "application/x-yaml")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+doc.Name+".yaml\"")
	w.Write(data)
}

func (s *Server) handleExportTrip(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	doc, err := s.store.ExportTrip(r.Context(), tripID, false)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "not_found", "trip not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "export failed")
		return
	}
	data, err := portable.Marshal(doc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "marshal failed")
		return
	}
	w.Header().Set("Content-Type", "application/x-yaml")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+doc.Name+".yaml\"")
	w.Write(data)
}
