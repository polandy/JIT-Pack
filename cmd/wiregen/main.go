// Command wiregen writes the client's half of the wire contract (NFR-4.14).
//
// It reads internal/api/wire.go and writes client/src/api/types.ts and
// client/src/api/routes.ts — the shapes and the paths, one declaration — and
// reads the store's table registry and schema.sql to write
// client/src/api/tables.ts, the per-table half (ARCH-11). Run it
// through `make wire` from the repository root; `make ci` runs it too and fails
// when the checked-in file differs, so a wire change the client has not
// followed is a red pipeline rather than a hand-test later (ADR-026).
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"jitpack/internal/wiregen"
)

const (
	sourcePath       = "internal/api/wire.go"
	targetPath       = "client/src/api/types.ts"
	routesTargetPath = "client/src/api/routes.ts"
	storeDir         = "internal/store"
	schemaPath       = "internal/store/schema.sql"
	tablesTargetPath = "client/src/api/tables.ts"
)

func main() {
	out := flag.String("o", targetPath, "where to write the generated types; the gate points this at a temporary file so it can diff without touching the tree")
	routesOut := flag.String("routes-o", routesTargetPath, "where to write the generated path builders")
	tablesOut := flag.String("tables-o", tablesTargetPath, "where to write the generated table contract")
	flag.Parse()
	if err := run(*out, *routesOut, *tablesOut); err != nil {
		fmt.Fprintln(os.Stderr, "wiregen:", err)
		os.Exit(1)
	}
}

func run(target, routesTarget, tablesTarget string) error {
	src, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read the contract (run this from the repository root): %w", err)
	}
	name := filepath.Base(sourcePath)

	types, err := wiregen.Generate(name, src)
	if err != nil {
		return err
	}
	routes, err := wiregen.GenerateRoutes(name, src)
	if err != nil {
		return err
	}
	tables, err := generateTables()
	if err != nil {
		return err
	}
	// Generated before either is written: a contract that cannot produce its
	// paths must not leave a regenerated types.ts behind, because the gate
	// would then report drift on a file the run itself had just rewritten.
	if err := write(target, types); err != nil {
		return err
	}
	if err := write(routesTarget, routes); err != nil {
		return err
	}
	return write(tablesTarget, tables)
}

// generateTables reads the store package as source — never imports it, so the
// generator stays a leaf (invariant 1) — together with the schema.
func generateTables() (string, error) {
	entries, err := os.ReadDir(storeDir)
	if err != nil {
		return "", fmt.Errorf("read the store package: %w", err)
	}
	sources := map[string][]byte{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		src, err := os.ReadFile(filepath.Join(storeDir, name))
		if err != nil {
			return "", err
		}
		sources[name] = src
	}
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		return "", fmt.Errorf("read the schema: %w", err)
	}
	return wiregen.GenerateTables(sources, schema)
}

func write(target, content string) error {
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", target, err)
	}
	fmt.Println("wiregen: wrote", target)
	return nil
}
