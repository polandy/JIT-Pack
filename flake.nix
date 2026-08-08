{
  description = "JIT-Pack development shell — the toolchain `make ci` expects";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            # go.mod says 1.25 and CI resolves it via go-version-file, so the
            # shell must not hand you a newer compiler than the pipeline uses.
            pkgs.go_1_25
            pkgs.gnumake
            # Keep in step with the golangci-lint-action version in
            # .github/workflows/ci.yml — a local lint that runs a different
            # major version is worse than no local lint.
            pkgs.golangci-lint
            pkgs.nodejs_24
            pkgs.gh
          ];

          shellHook = ''
            echo "JIT-Pack dev shell — go $(go env GOVERSION), node $(node --version), golangci-lint $(golangci-lint version --short 2>/dev/null)"
            echo "Run 'make ci' before finishing a change."
          '';
        };
      });
    };
}
