package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Run from anywhere but the repository root and the contract is simply not
// there. The message has to say so, because the mistake is easy and the raw
// "no such file" names a path that looks like a missing file rather than a
// wrong directory.
func TestRun_OutsideTheRepositoryRootSaysWhere(t *testing.T) {
	t.Chdir(t.TempDir())

	err := run(filepath.Join(t.TempDir(), "types.ts"))
	if err == nil {
		t.Fatal("want an error with no contract to read, got none")
	}
	if !strings.Contains(err.Error(), "repository root") {
		t.Errorf("the error must name the cause, got %v", err)
	}
}

func TestRun_UnwritableTargetIsReported(t *testing.T) {
	root := repoRoot(t)
	t.Chdir(root)

	err := run(filepath.Join(t.TempDir(), "no-such-directory", "types.ts"))
	if err == nil {
		t.Fatal("want an error for an unwritable target, got none")
	}
	if !strings.Contains(err.Error(), "write") {
		t.Errorf("the error must say what failed, got %v", err)
	}
}

func TestRun_WritesTheContractToTheGivenTarget(t *testing.T) {
	root := repoRoot(t)
	t.Chdir(root)

	target := filepath.Join(t.TempDir(), "types.ts")
	if err := run(target); err != nil {
		t.Fatalf("run: %v", err)
	}
	out, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	// The header is what tells a reader not to edit the file; without it the
	// generation is indistinguishable from a hand-written module.
	if !strings.Contains(string(out), "Do not edit") {
		t.Errorf("the generated module lost its header:\n%s", out)
	}
}

// repoRoot walks up from the test's own directory to the module root, so the
// tests do not depend on where `go test` was invoked.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("no go.mod above the test directory")
		}
		dir = parent
	}
}
