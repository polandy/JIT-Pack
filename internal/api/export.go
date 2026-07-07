package api

import (
	"database/sql"
	"errors"
	"io"
	"net/http"

	"jitpack/internal/portable"
)

const maxImportBody = 1 << 20 // 1 MB

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

func (s *Server) handleImportTemplate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxImportBody))
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "read body failed")
		return
	}
	doc, err := portable.Unmarshal(body)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	if doc.Kind != "template" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "expected kind: template")
		return
	}

	userID, _ := r.Context().Value(userIDKey).(string)
	templateID, err := s.store.ImportTemplate(r.Context(), userID, doc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "import failed")
		return
	}
	writeJSON(w, map[string]any{"ok": true, "template_id": templateID})
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

func (s *Server) handleImportTrip(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxImportBody))
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "read body failed")
		return
	}
	doc, err := portable.Unmarshal(body)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	if doc.Kind != "trip" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "expected kind: trip")
		return
	}

	userID, _ := r.Context().Value(userIDKey).(string)
	tripID, err := s.store.ImportTrip(r.Context(), userID, doc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "import failed")
		return
	}
	writeJSON(w, map[string]any{"ok": true, "trip_id": tripID})
}
