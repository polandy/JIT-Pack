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
	Kind          string `yaml:"kind"`
	SchemaVersion int    `yaml:"schema_version"`
	Name          string `yaml:"name"`
	// Scope is the template's own scope (FR-27.1: "group" or "template"),
	// distinct from Kind, which says whether the document is a template or a
	// trip. Omitted on trips and on files written before scopes existed —
	// those read back as "template", the same default migration 016 applies.
	Scope     string `yaml:"scope,omitempty"`
	StartDate string `yaml:"start_date,omitempty"`
	EndDate   string `yaml:"end_date,omitempty"`
	// FR-2.1b: the one required temporal fact. Absent in files written
	// before it existed, where the end date carries the same information.
	Year       int         `yaml:"year,omitempty"`
	Travelers  []Traveler  `yaml:"travelers,omitempty"`
	Containers []Container `yaml:"containers,omitempty"`
	// Includes carries a Ferien-Vorlage's groups *whole* rather than by
	// reference (FR-27.1, ADR-017): FR-18.2 promises a file that survives the
	// trip to a different instance, and a bare name means nothing there.
	// Template documents of scope "template" only.
	Includes []Group `yaml:"includes,omitempty"`
	Items    []Item  `yaml:"items"`
}

// Group is one included group inside a Ferien-Vorlage document (FR-27.1).
// It is deliberately not a Document: a group carries positions and never
// further groups, and the two-level rule is what makes cycles impossible.
type Group struct {
	Name  string `yaml:"name"`
	Items []Item `yaml:"items,omitempty"`
}

// Item represents one entry in the portable format — shared between
// template items and trip items, with some fields only relevant to one kind.
type Item struct {
	Name       string         `yaml:"name"`
	Quantity   Quantity       `yaml:"quantity"`
	Assignment string         `yaml:"assignment,omitempty"` // template only
	Conditions map[string]any `yaml:"conditions,omitempty"` // template only
	Mode       string         `yaml:"mode,omitempty"`       // trip only
	Category   string         `yaml:"category,omitempty"`
	Traveler   string         `yaml:"traveler,omitempty"`  // trip only, by name
	Container  string         `yaml:"container,omitempty"` // trip only, by name

	// PackedCount is a pointer so that nil (omit) vs 0 (explicit) is
	// distinguishable — FR-18.3 lets the user choose clean vs progress export.
	PackedCount *int `yaml:"packed_count,omitempty"` // trip only

	DefaultMode string `yaml:"default_mode,omitempty"` // template only
	LatePacker  bool   `yaml:"late_packer,omitempty"`
	Dedup       string `yaml:"dedup,omitempty"` // template only

	// Tasks are the position's FR-27.7 preparation tasks. Template only:
	// on a trip the same knowledge is an ordinary FR-7.3 todo.
	Tasks []string `yaml:"tasks,omitempty"`
}

// Traveler is a named person in a trip export. The Adult/Child type was
// retired with FR-25.9; yaml.v3 ignores unknown keys, so a document
// exported before that still imports — its profile is simply dropped.
type Traveler struct {
	Name string `yaml:"name"`
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

// The two document kinds a portable file may declare (FR-18.2), named
// because both the validator and the reader switch on them.
const (
	KindTemplate = "template"
	KindTrip     = "trip"
)

// The template scopes a portable file may declare (FR-27.1/27.6). Same two
// values `templates.kind` carries in the schema, restated here because
// `portable` imports nothing internal (invariant 1).
const (
	ScopeGroup    = "group"
	ScopeTemplate = "template"
)

func validateDoc(doc Document) error {
	if doc.Kind == "" {
		return errors.New("missing required field: kind")
	}
	if doc.Kind != KindTemplate && doc.Kind != KindTrip {
		return fmt.Errorf("unknown kind: %q (expected template or trip)", doc.Kind)
	}
	if doc.Name == "" {
		return errors.New("missing required field: name")
	}
	// A scope on a trip document, or an unknown one, is a file this build
	// cannot honour — rejecting beats importing a group as a Ferien-Vorlage.
	if doc.Scope != "" {
		if doc.Kind != KindTemplate {
			return fmt.Errorf("scope %q is only valid on a template document", doc.Scope)
		}
		if doc.Scope != ScopeGroup && doc.Scope != ScopeTemplate {
			return fmt.Errorf("unknown scope: %q (expected group or template)", doc.Scope)
		}
	}
	if err := validateIncludes(doc); err != nil {
		return err
	}
	return nil
}

// validateIncludes enforces the two structural rules of FR-27.1 at the file
// boundary: only a Ferien-Vorlage composes, and every included group has a
// name — the name being its whole identity across instances (ADR-017).
func validateIncludes(doc Document) error {
	if len(doc.Includes) == 0 {
		return nil
	}
	if doc.Kind != KindTemplate {
		return errors.New("includes are only valid on a template document")
	}
	if doc.Scope == ScopeGroup {
		return errors.New("a group cannot include other groups (FR-27.1 is two levels)")
	}
	for _, g := range doc.Includes {
		if g.Name == "" {
			return errors.New("included group is missing its name")
		}
	}
	return nil
}

// Quantity is a plain integer amount. Files written before formulas were
// retired (FR-1.3/1.5, 2026-08-08) carried strings — sometimes numeric
// ("3"), sometimes a formula ("ceil(trip_duration / 7)"). Imports stay
// tolerant per FR-18.4/18.5: numeric strings keep their value, formula
// strings fold to 1 rather than failing the whole file.
type Quantity int

func (q *Quantity) UnmarshalYAML(value *yaml.Node) error {
	var n int
	if err := value.Decode(&n); err == nil {
		*q = Quantity(n)
		return nil
	}
	var s string
	if err := value.Decode(&s); err != nil {
		return fmt.Errorf("quantity: %w", err)
	}
	n = 0
	for _, r := range s {
		if r < '0' || r > '9' {
			*q = 1 // legacy formula string
			return nil
		}
		n = n*10 + int(r-'0')
	}
	if s == "" {
		n = 1
	}
	*q = Quantity(n)
	return nil
}
