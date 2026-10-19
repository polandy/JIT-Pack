# ADR-102: `docker-build` authenticates to public ECR via AWS OIDC, over mirroring the base images into GHCR

**Status:** Accepted
**Related:** ADR-043, CLAUDE.md invariant 8, `.github/workflows/ci.yml` (`docker-build`),
`.github/workflows/docker.yml`, `dev-docs/ci.md`, TODO.md ("Stop `docker-build` going red on public.ecr.aws rate
limits")

**Decision Drivers (in priority order):**
1. **Stop the false-red without weakening invariant 8.** The `@sha256` pin on each base image is the thing CI is
   supposed to protect; the fix must not trade it away.
2. **Dependabot's weekly digest bump must keep working unattended.** It is the only mechanism that notices a new
   node/golang/alpine patch; a fix that quietly stops it from seeing upstream is worse than today's flake.
3. **Lowest new attack/maintenance surface.** The repo has never depended on AWS; the fix should cost as little
   standing infrastructure as the problem is worth.

---

## Considered Options

### Option A — authenticate the pull via AWS OIDC *(recommended, accepted)*

`docker-build` (`ci.yml`) and the release build (`docker.yml`) gain an `id-token: write` permission and an
`aws-actions/configure-aws-credentials` step that assumes a role trusted only for this repository's GitHub Actions
OIDC token (no stored access key), then `aws ecr-public get-login-password | docker login` before the existing
`docker build`/`build-push-action` step. The role ARN comes from a repo variable
(`vars.AWS_ECR_PUBLIC_ROLE_ARN`), never a literal. Nothing else changes: the Dockerfile keeps its three
`public.ecr.aws/docker/library/...@sha256:...` `FROM` lines, and Dependabot's `docker` ecosystem keeps watching
that same registry for new digests, exactly as it does today.

**Pros**
- Two workflow files change; the Dockerfile, `toolchain-pins-gate.sh` and Dependabot's update flow are untouched.
- An authenticated AWS principal gets its own pull quota on public ECR, separate from the anonymous pool every
  other GitHub-hosted runner on the planet shares — the 429s stop being a function of how busy *other* CI jobs are.
- OIDC federation (no `aws-secretsmanager`, no long-lived `AWS_SECRET_ACCESS_KEY`) means there is no key to rotate
  or leak; the trust policy can be scoped to this repository and this workflow alone.

**Cons**
- A new external dependency: an AWS account now exists for CI's sake, and someone has to create the OIDC
  provider and the role once (see the PR description for the exact steps). Nothing in the shipped product
  depends on it — it is a build-time detail of a self-hosted app, not a runtime one — but it is a first for this
  repo.
- `docker-build` (and, in the much rarer case of a release during an AWS outage, `docker.yml`) stays red until
  that role exists, because there is no static fallback.

### Option B — mirror the three pinned digests into GHCR

A new scheduled or Dependabot-triggered workflow copies each pinned digest byte-for-byte (`skopeo`/`crane`, same
`sha256`, new host) into `ghcr.io/polandy/jit-pack-base/...`; the Dockerfile's three `FROM` lines move to that
registry. `ghcr.io` already has standing trust in this repo (`docker.yml` already pushes the release image there
with the ambient `GITHUB_TOKEN`), so no new account is needed.

**Pros**
- No AWS account, ever. GHCR pulls from GitHub-hosted runners are not subject to the public-ECR anonymous limit.
- Reuses a registry and a login pattern (`docker/login-action` + `GITHUB_TOKEN`) already proven in `docker.yml`.

**Cons**
- Dependabot's `docker` ecosystem discovers a new version by asking *the registry named in the `FROM` line* for
  one. Once that line names our own GHCR mirror, Dependabot only ever sees whatever that mirror already holds —
  it stops seeing new upstream node/golang/alpine releases unless a second, hand-written job re-implements "watch
  three independent upstreams for a new digest and re-sync," which is exactly what Dependabot already does for
  free against `public.ecr.aws` today. That failure is silent (no error, just no future bump PRs), which makes it
  worse than the 429 it replaces.
- The mirror-sync job itself still has to pull from `public.ecr.aws` at least once per upstream release, so the
  429 risk is not eliminated, only moved to a lower-frequency, easier-to-miss job.
- A second, home-grown supply-chain step (copy-preserving-digest) to audit, instead of relying on upstream's and
  Dependabot's existing one.

---

## Decision Matrix

| Driver | Weight | A — AWS OIDC auth | B — GHCR mirror |
|---|---|---|---|
| Invariant 8 kept intact | 3 | 3 — pins and `FROM` lines unchanged | 2 — pins kept, but the registry they live in is now ours |
| Dependabot keeps working unattended | 3 | 3 — untouched | 1 — breaks silently without a second sync job |
| Lowest new standing surface | 2 | 2 — one role, no runtime dependency | 1 — a registry, a sync job, and a copy-fidelity question |
| **Total** | | **17** | 8 |

---

## Decision

`docker-build` and the release build authenticate to `public.ecr.aws` with a short-lived AWS credential obtained
through GitHub's OIDC token and a repo-scoped IAM role (`vars.AWS_ECR_PUBLIC_ROLE_ARN`), via
`aws-actions/configure-aws-credentials`, pinned by commit SHA per invariant 8. The Dockerfile and Dependabot's
`docker` ecosystem update flow are unchanged.

## Consequences

**Positive**
- The three `@sha256` pins, `toolchain-pins-gate.sh` and the weekly Dependabot digest bump all keep working exactly
  as specified elsewhere; this decision is confined to two workflow files.
- No long-lived secret is stored in the repo; a compromised runner only ever holds a token scoped to this role for
  the life of one job.

**Negative / accepted costs**
- The repo now has a (CI-only) dependency on an AWS account existing and its OIDC trust staying configured. If
  that account is ever closed, the two login steps go back to being no-ops (see below) and the 429 risk returns.
- Both the `configure-aws-credentials` and the `aws ecr-public get-login-password` step carry
  `if: vars.AWS_ECR_PUBLIC_ROLE_ARN != ''`, so until the owner completes the one-time AWS-side setup they are
  skipped and the pull stays anonymous — today's behaviour, 429s included. This was chosen over letting the
  missing variable hard-fail the job: a release tag pushed before that setup still builds. The accepted cost is
  that the rate-limit fix is silent about not yet being in effect — nothing in the run tells you the steps were
  skipped rather than unnecessary — so `dev-docs/ci.md` says so explicitly instead.

**Neutral**
- `aws-region: us-east-1` is hardcoded rather than taken from a variable: Amazon ECR Public is a single-region
  service, so the region is a fact about AWS, not a per-deployment choice.

## Revisit Trigger

Amazon ECR Public's anonymous rate limit changes (raised or removed) such that unauthenticated CI pulls stop
429ing; or a second pinned-by-digest base image source outside `public.ecr.aws` is added, at which point the
repo-scoped role's trust policy and this ADR should be re-read together.
