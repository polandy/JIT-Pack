// Command wiregen writes the client's half of the wire contract (NFR-4.14).
//
// It reads internal/api/wire.go and writes client/src/api/types.ts. Run it
// through `make wire` from the repository root; `make ci` runs it too and fails
// when the checked-in file differs, so a wire change the client has not
// followed is a red pipeline rather than a hand-test later (ADR-026).
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"jitpack/internal/wiregen"
)

const (
	sourcePath = "internal/api/wire.go"
	targetPath = "client/src/api/types.ts"
)

func main() {
	out := flag.String("o", targetPath, "where to write the generated module; the gate points this at a temporary file so it can diff without touching the tree")
	flag.Parse()
	if err := run(*out); err != nil {
		fmt.Fprintln(os.Stderr, "wiregen:", err)
		os.Exit(1)
	}
}

func run(target string) error {
	src, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read the contract (run this from the repository root): %w", err)
	}
	out, err := wiregen.Generate(filepath.Base(sourcePath), src)
	if err != nil {
		return err
	}
	if err := os.WriteFile(target, []byte(out), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", target, err)
	}
	fmt.Println("wiregen: wrote", target)
	return nil
}
