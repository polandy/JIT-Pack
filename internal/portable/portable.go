// Package portable defines the human-readable YAML format for exporting
// and importing templates and trip packing lists (Addendum FR-18.1–18.6).
// It contains only data types and marshal/unmarshal — no I/O, no database.
package portable

import (
	"errors"
	"fmt"

	"gopkg.in/yaml.v3"
)

// Document is the top-level YAML envelope for both template and trip exports.
type Document struct {
	Kind          string      `yaml:"kind"`
	SchemaVersion int         `yaml:"schema_version"`
	Name          string      `yaml:"name"`
	StartDate     string      `yaml:"start_date,omitempty"`
	EndDate       string      `yaml:"end_date,omitempty"`
	Travelers     []Traveler  `yaml:"travelers,omitempty"`
	Containers    []Container `yaml:"containers,omitempty"`
	Items         []Item      `yaml:"items"`
}

// Item represents one entry in the portable format — shared between
// template items and trip items, with some fields only relevant to one kind.
type Item struct {
	Name       string         `yaml:"name"`
	Quantity   string         `yaml:"quantity"`
	Assignment string         `yaml:"assignment,omitempty"` // template only
	Unit       string         `yaml:"unit,omitempty"`
	Conditions map[string]any `yaml:"conditions,omitempty"` // template only
	Mode       string         `yaml:"mode,omitempty"`       // trip only
	Category   string         `yaml:"category,omitempty"`
	Traveler   string         `yaml:"traveler,omitempty"`   // trip only, by name
	Container  string         `yaml:"container,omitempty"`  // trip only, by name

	// PackedCount is a pointer so that nil (omit) vs 0 (explicit) is
	// distinguishable — FR-18.3 lets the user choose clean vs progress export.
	PackedCount *int `yaml:"packed_count,omitempty"` // trip only

	DefaultMode string `yaml:"default_mode,omitempty"` // template only
	LatePacker  bool   `yaml:"late_packer,omitempty"`
	Dedup       string `yaml:"dedup,omitempty"` // template only
}

// Traveler is a named person in a trip export.
type Traveler struct {
	Name    string `yaml:"name"`
	Profile string `yaml:"profile"`
}

// Container is a named luggage container in a trip export.
type Container struct {
	Name           string `yaml:"name"`
	Carrier        string `yaml:"carrier,omitempty"` // traveler name
	MaxWeightGrams int    `yaml:"max_weight_grams,omitempty"`
}

// Marshal serializes a Document to YAML.
func Marshal(doc Document) ([]byte, error) {
	return yaml.Marshal(doc)
}

// Unmarshal parses YAML into a Document, validating required fields.
// Unrecognized fields are silently ignored (FR-18.5).
func Unmarshal(data []byte) (Document, error) {
	var doc Document
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return Document{}, fmt.Errorf("invalid YAML: %w", err)
	}
	if err := validateDoc(doc); err != nil {
		return Document{}, err
	}
	return doc, nil
}

func validateDoc(doc Document) error {
	if doc.Kind == "" {
		return errors.New("missing required field: kind")
	}
	if doc.Kind != "template" && doc.Kind != "trip" {
		return fmt.Errorf("unknown kind: %q (expected template or trip)", doc.Kind)
	}
	if doc.Name == "" {
		return errors.New("missing required field: name")
	}
	return nil
}
