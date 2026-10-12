package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"slices"
	"strings"
	"testing"
)

// Invariant 1 held by the toolchain's own answer rather than by reading. The
// rule is about the transitive graph (`go list -deps`): a leaf that reaches
// `store` through a helper package breaks it as surely as a direct import,
// and no review of one file's import block can see that.
//
// The test lives in the composition root because this is the one package
// allowed to know every other; anywhere else it would have to name packages
// its own layer may not mention.

// modulePrefix is the module path every internal import starts with.
const modulePrefix = "jitpack/internal/"

// packageRule is what one internal package may depend on, transitively.
type packageRule struct {
	// internal are the internal packages it may reach, by name under
	// internal/.
	internal []string
	// standardOnly refuses every dependency outside the standard library and
	// the internal packages above — the leaves stay trivially testable and the
	// server's one outbound fetch (`linkpreview`) carries no third-party code.
	standardOnly bool
}

// dependencyRules is invariant 1 (CLAUDE.md) with CODING_PRINCIPLES §3's
// "standard library only" beside it. Every internal package has a row: a new
// one takes its place in the order on purpose, never by default.
var dependencyRules = map[string]packageRule{
	"api":         {internal: []string{"notify", "store", "sync", "linkpreview"}},
	"notify":      {internal: []string{"store", "sync"}},
	"store":       {internal: []string{"sync"}},
	"sync":        {standardOnly: true},
	"wiregen":     {standardOnly: true},
	"linkpreview": {standardOnly: true},
	"webui":       {standardOnly: true}, // the API prefixes are passed in, never imported
}

// sqlOwner is the only package that may import database/sql (§3).
const sqlOwner = "store"

// listedPackage is the part of `go list -json` the rules read.
type listedPackage struct {
	ImportPath string
	Standard   bool
	Imports    []string
	Deps       []string
}

func TestDependencyDirection_Invariant1(t *testing.T) {
	packages := listPackages(t)
	if n := len(internalPackages(packages)); n < len(dependencyRules) {
		t.Fatalf("go list named %d internal packages, the rules %d — the listing is not seeing ./internal/...", n, len(dependencyRules))
	}
	for _, v := range dependencyViolations(packages) {
		t.Error(v)
	}
	for name := range dependencyRules {
		if _, ok := packages[modulePrefix+name]; !ok {
			t.Errorf("dependencyRules has a row for internal/%s, which go list does not find", name)
		}
	}
}

// The check must be able to fail: a graph breaking each kind of rule is
// refused with that rule, so the green run above is a statement about the
// repository and not about a check that sees nothing.
func TestDependencyDirection_RefusesEachKindOfBreak(t *testing.T) {
	for _, tc := range []struct {
		name string
		pkg  listedPackage
		want string
	}{
		{"a leaf reaches an internal package", listedPackage{ImportPath: modulePrefix + "sync", Deps: []string{modulePrefix + "store"}}, "reaches internal/store"},
		{"a standard-only package reaches a module", listedPackage{ImportPath: modulePrefix + "webui", Deps: []string{"example.com/router"}}, "standard library only"},
		{"database/sql outside the store", listedPackage{ImportPath: modulePrefix + "api", Imports: []string{"database/sql"}}, "imports database/sql"},
		{"a package without a row", listedPackage{ImportPath: modulePrefix + "mailer"}, "no row in dependencyRules"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := dependencyViolations(map[string]listedPackage{tc.pkg.ImportPath: tc.pkg})
			if len(got) != 1 || !strings.Contains(got[0], tc.want) {
				t.Errorf("violations = %q, want one containing %q", got, tc.want)
			}
		})
	}
}

// internalPackages picks this module's internal packages out of a listing,
// keyed by their name under internal/.
func internalPackages(packages map[string]listedPackage) map[string]listedPackage {
	internal := map[string]listedPackage{}
	for path, p := range packages {
		if name, ok := strings.CutPrefix(path, modulePrefix); ok {
			internal[name] = p
		}
	}
	return internal
}

// dependencyViolations holds every internal package in the listing to its
// row in dependencyRules. A dependency the listing does not describe counts
// as outside the standard library.
func dependencyViolations(packages map[string]listedPackage) []string {
	var violations []string
	for name, p := range internalPackages(packages) {
		rule, ok := dependencyRules[name]
		if !ok {
			violations = append(violations, fmt.Sprintf("internal/%s has no row in dependencyRules — give it its place in invariant 1", name))
			continue
		}
		for _, dep := range p.Deps {
			if reached, ok := strings.CutPrefix(dep, modulePrefix); ok {
				if !slices.Contains(rule.internal, reached) {
					violations = append(violations, fmt.Sprintf("internal/%s reaches internal/%s, which invariant 1 does not allow it", name, reached))
				}
				continue
			}
			if rule.standardOnly && !packages[dep].Standard {
				violations = append(violations, fmt.Sprintf("internal/%s reaches %s; it is standard library only", name, dep))
			}
		}
		if name != sqlOwner && slices.Contains(p.Imports, "database/sql") {
			violations = append(violations, fmt.Sprintf("internal/%s imports database/sql; only internal/%s may", name, sqlOwner))
		}
	}
	return violations
}

// listPackages runs `go list -deps -json` over the internal packages and
// returns every package it names, the standard library's included, so a
// dependency's Standard flag can be read.
func listPackages(t *testing.T) map[string]listedPackage {
	t.Helper()
	cmd := exec.Command("go", "list", "-deps", "-json=ImportPath,Standard,Imports,Deps", "jitpack/internal/...")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, stderr.String())
	}
	packages := map[string]listedPackage{}
	dec := json.NewDecoder(bytes.NewReader(out))
	for {
		var p listedPackage
		if err := dec.Decode(&p); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			t.Fatalf("decoding go list: %v", err)
		}
		packages[p.ImportPath] = p
	}
	return packages
}
