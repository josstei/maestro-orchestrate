<!-- Source: .github/workflows/*.yml, justfile -->

# CI/CD Pipeline

Maestro uses six GitHub Actions workflows organized around a **source-of-truth enforcement** model. Every workflow regenerates runtime adapters from canonical `src/` and verifies zero drift before proceeding. The pipeline spans continuous integration on every push/PR through automated release publishing to npm.

## Workflow Overview

```mermaid
graph LR
    subgraph "Continuous Integration"
        A["Push / PR to main or dev"] --> B["Source Of Truth Check"]
    end

    subgraph "Pre-release Publishing"
        C["PR labeled 'preview'"] --> D["Preview Build"]
        E["Manual dispatch from dev"] --> F["Prepare Release"]
        F --> |"Creates release/vX.Y.Z branch<br/>Opens PR to main with<br/>'release' + 'rc' labels"| G["Release Candidate"]
    end

    subgraph "Release Publishing"
        G --> |"PR merged to main"| H["Release"]
        H --> |"Back-merge PR<br/>main into dev"| I["dev branch updated"]
    end

    subgraph "Scheduled"
        J["Cron: daily 06:00 UTC"] --> K["Nightly Build"]
    end
```

All six workflows share a common validation core: generate runtime adapters, check for drift, and run the full test suite. Four of the six workflows — Nightly Build, Preview Build, Release Candidate, and Release — gate npm publishing on the presence of the `NPM_TOKEN` secret. When the token is unavailable (for example, in forks), the publish steps are skipped gracefully while validation still runs.

## Source Of Truth Check

### Purpose

The foundational CI gate. Enforces that all generated runtime adapters (Gemini, Claude Code, Codex) are in sync with canonical source in `src/`, and that the full test suite passes. Runs on every push and pull request targeting `main` or `dev`.

### Trigger

| Event | Branches |
|-------|----------|
| `push` | `main`, `dev` |
| `pull_request` | `main`, `dev` |

### Flow

```mermaid
graph TD
    A["Push or PR to main/dev"] --> B["Checkout repository"]
    B --> C["Setup Node.js 20"]
    C --> D["Generate runtime adapters"]
    D --> E{"Adapter drift?"}
    E --> |"Yes"| F["Fail: adapters out of sync"]
    E --> |"No"| G["Run full test suite"]
    G --> H{"Tests pass?"}
    H --> |"Yes"| I["Check passes"]
    H --> |"No"| J["Fail: test failures"]
```

### Job Breakdown

**Job: `check-architecture` (name: `source-of-truth-check`)**

| Step | Description |
|------|-------------|
| Checkout | Pins `actions/checkout` to SHA `11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2) |
| Setup Node.js | Installs Node.js 20 via `actions/setup-node@v4` |
| Generate runtime adapters | Runs `node scripts/generate.js` to rebuild all runtime outputs |
| Check adapter drift | Runs `git diff --exit-code --name-only`; fails with annotation if any generated file differs from what is committed |
| Run full test suite | Executes `node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js` |

### Environment and Secrets

Uses default permissions (read-only). No secrets or environment variables required.

### Artifacts

None produced or consumed.

### Key Behaviors

- The drift check emits a GitHub Actions error annotation (`::error::`) with a `git diff --stat` summary on failure, providing immediate visibility into which files drifted.
- This workflow serves as the required status check that blocks PR merges.

---

## Nightly Build

### Purpose

Publishes a nightly snapshot of the `dev` branch to npm under the `nightly` dist-tag. Validates the `dev` branch has no drift and passes all tests before publishing. Runs on a daily schedule and can be triggered manually.

### Trigger

| Event | Details |
|-------|---------|
| `schedule` | Cron: `0 6 * * *` (daily at 06:00 UTC) |
| `workflow_dispatch` | Manual trigger with no inputs |

### Flow

```mermaid
graph TD
    A["Schedule or manual dispatch"] --> B["Checkout dev branch"]
    B --> C["Setup Node.js 20 with npm registry"]
    C --> D["Generate runtime adapters"]
    D --> E{"Adapter drift?"}
    E --> |"Yes"| F["Fail: nightly drift on dev"]
    E --> |"No"| G["Run full test suite"]
    G --> H{"Tests pass?"}
    H --> |"No"| I["Fail: test failures"]
    H --> |"Yes"| J{"NPM_TOKEN available?"}
    J --> |"No"| K["Skip publish"]
    J --> |"Yes"| L["Set nightly version<br/>X.Y.Z-nightly.YYYYMMDD"]
    L --> M["Publish to npm<br/>--tag nightly"]
```

### Job Breakdown

**Job: `nightly`**

| Step | Description |
|------|-------------|
| Checkout | Checks out `refs/heads/dev` explicitly, pinned to SHA `11bd71901bbe5b1630ceea73d27597364c9af683` |
| Setup Node.js | Node.js 20 with `registry-url` set to `https://registry.npmjs.org` |
| Generate runtime adapters | Runs `node scripts/generate.js` |
| Check adapter drift | Fails with `::error::Nightly drift detected on dev` if generated files differ |
| Run full test suite | Executes the full test suite |
| Determine publish eligibility | Sets `enabled=true` output if `NPM_TOKEN` secret is present |
| Set nightly version | Computes version as `{base}-nightly.{YYYYMMDD}` using `npm version --no-git-tag-version` |
| Publish nightly | Publishes with `npm publish --tag nightly --access public` |

### Environment and Secrets

| Item | Type | Purpose |
|------|------|---------|
| `NPM_TOKEN` | Secret | Authenticates with npm registry for publishing |
| `NODE_AUTH_TOKEN` | Env (derived) | Set to `$NPM_TOKEN` value for npm CLI authentication |

**Permissions**: `contents: read`

### Artifacts

Publishes `@maestro-orchestrator/maestro@X.Y.Z-nightly.YYYYMMDD` to npm with the `nightly` dist-tag.

### Key Behaviors

- Always checks out the `dev` branch regardless of what triggered it.
- The version string includes the date stamp, so each nightly replaces the previous day's version on the `nightly` tag.
- When `NPM_TOKEN` is absent, the workflow still validates drift and runs tests, providing health checks for forks.

---

## Preview Build

### Purpose

Publishes a preview package from a pull request so reviewers can install and test changes before merging. Activated by adding the `preview` label to any PR.

### Trigger

| Event | Details |
|-------|---------|
| `pull_request` | Types: `labeled`, `synchronize`, `reopened` |
| **Condition** | PR must have the `preview` label |

### Flow

```mermaid
graph TD
    A["PR labeled/synchronize/reopened"] --> B{"Has 'preview' label?"}
    B --> |"No"| C["Skip workflow"]
    B --> |"Yes"| D["Checkout PR head SHA"]
    D --> E["Setup Node.js 20 with npm registry"]
    E --> F["Generate runtime adapters"]
    F --> G{"Adapter drift?"}
    G --> |"Yes"| H["Fail: preview drift detected"]
    G --> |"No"| I["Run full test suite"]
    I --> J{"Tests pass?"}
    J --> |"No"| K["Fail: test failures"]
    J --> |"Yes"| L{"NPM_TOKEN available?"}
    L --> |"No"| M["Skip publish"]
    L --> |"Yes"| N["Set preview version<br/>X.Y.Z-preview.SHORT_SHA"]
    N --> O["Publish to npm<br/>--tag preview"]
    O --> P["Upsert PR comment<br/>with install command"]
```

### Job Breakdown

**Job: `preview`**

| Step | Description |
|------|-------------|
| Checkout | Checks out the PR head repository and SHA (supports fork PRs) |
| Setup Node.js | Node.js 20 with npm registry URL |
| Generate runtime adapters | Runs `node scripts/generate.js` |
| Check adapter drift | Fails with `::error::Preview drift detected` if drift exists |
| Run full test suite | Executes the full test suite |
| Determine publish eligibility | Gates on `NPM_TOKEN` presence |
| Set preview version | Computes version as `{base}-preview.{7-char SHA}` |
| Publish preview | Publishes with `npm publish --tag preview --access public` |
| Upsert PR comment | Posts or updates a PR comment with the install command |

### Environment and Secrets

| Item | Type | Purpose |
|------|------|---------|
| `NPM_TOKEN` | Secret | npm registry authentication |
| `NODE_AUTH_TOKEN` | Env (derived) | Set to `$NPM_TOKEN` for npm CLI |
| `GH_TOKEN` | Env (derived) | Set to `${{ github.token }}` for PR comment API calls |

**Permissions**: `contents: read`, `pull-requests: write`

### Artifacts

Publishes `@maestro-orchestrator/maestro@X.Y.Z-preview.SHORT_SHA` to npm with the `preview` dist-tag.

### Key Behaviors

- Uses concurrency group `preview-{PR number}` with `cancel-in-progress: true`, so pushing new commits cancels any in-flight preview build for the same PR.
- The PR comment is **upserted**: if a comment starting with "Preview published:" already exists, it is updated in place rather than posting a duplicate.
- The version embeds the first 7 characters of the commit SHA, making each preview uniquely traceable to a specific commit.

---

## Prepare Release

### Purpose

Orchestrates the release preparation process. Creates a release branch from `dev`, bumps version numbers, and opens two pull requests: one auto-merged back into `dev` (carrying the version bump) and one targeting `main` (the actual release PR). This is the entry point for the release pipeline.

### Trigger

| Event | Details |
|-------|---------|
| `workflow_dispatch` | Manual trigger from the `dev` branch only |
| **Input** | `version` (optional string): explicit version to release; when omitted, the version is inferred from commit history |

### Flow

```mermaid
graph TD
    A["Manual dispatch from dev"] --> B{"Running on dev branch?"}
    B --> |"No"| C["Fail: must run from dev"]
    B --> |"Yes"| D["Checkout with full history"]
    D --> E{"Version input provided?"}
    E --> |"Yes"| F["Use provided version"]
    E --> |"No"| G["Infer version from commits<br/>major/minor/patch"]
    F --> H["Validate version format<br/>X.Y.Z"]
    G --> H
    H --> I["Validate CHANGELOG<br/>has unreleased content"]
    I --> J["Generate and check drift"]
    J --> K["Run full test suite"]
    K --> L["Create release/vX.Y.Z branch"]
    L --> M["Update version files<br/>via scripts/update-versions.js"]
    M --> N["Regenerate with new version"]
    N --> O["Commit: 'release: vX.Y.Z'"]
    O --> P["Push release branch"]
    P --> Q["Open PR to dev<br/>with auto-merge"]
    Q --> R["Open PR to main<br/>with CHANGELOG excerpt"]
    R --> S["Label main PR:<br/>'release' + 'rc'"]
```

### Job Breakdown

**Job: `prepare`**

| Step | Description |
|------|-------------|
| Validate branch | Fails if not running from `refs/heads/dev` |
| Checkout | Full history (`fetch-depth: 0`) using `RELEASE_TOKEN` for push permissions |
| Setup Node.js | Installs Node.js 20 via `actions/setup-node@v4` |
| Infer version from commits | Scans commit logs since last tag; determines bump level: `BREAKING CHANGE` or `!:` triggers major, `feat` triggers minor, otherwise patch |
| Resolve target version | Uses explicit input if provided, otherwise uses inferred version |
| Validate target version | Ensures version matches `X.Y.Z` semver pattern |
| Validate CHANGELOG | Fails if the `[Unreleased]` section in `CHANGELOG.md` has no content |
| Generate and check drift | Runs generator and fails if `dev` has uncommitted drift |
| Run full test suite | Executes the full test suite |
| Create release branch | Creates `release/vX.Y.Z` from current `dev` |
| Update version files | Runs `node scripts/update-versions.js` with the target version |
| Regenerate with new version | Reruns generator and `npm install --package-lock-only` to update lockfile |
| Commit release | Commits all changes as `release: vX.Y.Z` using the `github-actions[bot]` identity |
| Push release branch | Pushes `release/vX.Y.Z` to origin |
| Open PR to dev | Creates a PR merging `release/vX.Y.Z` into `dev` with auto-merge enabled |
| Open PR to main | Creates a PR merging `release/vX.Y.Z` into `main` with CHANGELOG excerpt as body |
| Label release PR | Adds `release` and `rc` labels to the main-targeting PR |

### Environment and Secrets

| Item | Type | Purpose |
|------|------|---------|
| `RELEASE_TOKEN` | Secret | Personal access token with write permissions; used for checkout, branch push, PR creation, and auto-merge. Required because the default `GITHUB_TOKEN` cannot trigger downstream workflows. |

**Permissions**: `contents: write`, `pull-requests: write`

### Artifacts

Creates the `release/vX.Y.Z` branch and two pull requests: one targeting `dev` (auto-merged) and one targeting `main` (manually reviewed and merged).

### Key Behaviors

- The version inference algorithm uses conventional commit patterns: `BREAKING CHANGE` or `!:` in commit messages triggers a major bump, `feat` commits trigger minor, everything else triggers patch.
- The CHANGELOG validation ensures no release ships without documented changes.
- The `release` and `rc` labels on the main-targeting PR are what trigger the Release Candidate workflow.
- Uses `RELEASE_TOKEN` (not the default `GITHUB_TOKEN`) so that the push and PR creation events trigger downstream workflow runs (generator-check on the new PR, and rc.yml when labels are applied).

---

## Release Candidate

### Purpose

Publishes release candidate packages to npm from release PRs targeting `main`. Activates automatically when the Prepare Release workflow labels a PR with both `release` and `rc`. Provides an installable RC package for final validation before the release merges.

### Trigger

| Event | Details |
|-------|---------|
| `pull_request` | Types: `labeled`, `synchronize`, `reopened` |
| **Conditions (all must be true)** | Base branch is `main` |
| | PR has both `rc` and `release` labels |
| | Head branch starts with `release/v` |

### Flow

```mermaid
graph TD
    A["PR event on release/vX.Y.Z to main"] --> B{"Base is main?<br/>Has 'rc' + 'release' labels?<br/>Head starts with 'release/v'?"}
    B -->|"Any condition false"| C["Skip workflow"]
    B -->|"All true"| D["Checkout PR head SHA"]
    D --> E["Setup Node.js 20 with npm registry"]
    E --> F["Generate runtime adapters"]
    F --> G{"Adapter drift?"}
    G --> |"Yes"| H["Fail: RC drift detected"]
    G --> |"No"| I["Run full test suite"]
    I --> J{"Tests pass?"}
    J --> |"No"| K["Fail: test failures"]
    J --> |"Yes"| L{"NPM_TOKEN available?"}
    L --> |"No"| M["Skip publish"]
    L --> |"Yes"| N["Determine RC version<br/>Query npm for existing RCs<br/>Increment RC number"]
    N --> O["Publish to npm<br/>--tag rc"]
    O --> P["Upsert PR comment<br/>with install command"]
```

### Job Breakdown

**Job: `rc`**

| Step | Description |
|------|-------------|
| Checkout | Checks out the PR head repository and SHA |
| Setup Node.js | Node.js 20 with npm registry URL |
| Generate runtime adapters | Runs `node scripts/generate.js` |
| Check adapter drift | Fails with `::error::RC drift detected` |
| Run full test suite | Executes the full test suite |
| Determine publish eligibility | Gates on `NPM_TOKEN` presence |
| Determine RC version | Reads base version from `package.json`, queries npm registry for existing RC versions of this base, increments the RC number to avoid collisions |
| Publish RC | Publishes with `npm publish --tag rc --access public` |
| Upsert PR comment | Posts or updates a comment with install command and short SHA |

### Environment and Secrets

| Item | Type | Purpose |
|------|------|---------|
| `NPM_TOKEN` | Secret | npm registry authentication |
| `NODE_AUTH_TOKEN` | Env (derived) | Set to `$NPM_TOKEN` for npm CLI |
| `GH_TOKEN` | Env (derived) | Set to `${{ github.token }}` for PR comment API calls |

**Permissions**: `contents: read`, `pull-requests: write`

### Artifacts

Publishes `@maestro-orchestrator/maestro@X.Y.Z-rc.N` to npm with the `rc` dist-tag, where `N` is auto-incremented.

### Key Behaviors

- Uses concurrency group `rc-{PR number}` with `cancel-in-progress: true` to avoid duplicate RC publishes when new commits are pushed to the release branch.
- The RC number auto-increments by querying `npm view` for existing versions, ensuring no version collision even when the workflow runs multiple times for the same base version.
- The PR comment is upserted (update existing or create new) to keep a single, current RC reference on the PR.

---

## Release

### Purpose

The final step of the release pipeline. Triggers on any push to `main`, but only acts when the push is a merged pull request carrying the `release` label. Creates a Git tag, publishes a GitHub Release with CHANGELOG notes, publishes the stable package to npm, and opens a back-merge PR from `main` into `dev`.

### Trigger

| Event | Details |
|-------|---------|
| `push` | Branch: `main` |
| **Condition** | The pushed commit must be the merge commit of a PR labeled `release` that targeted `main` |

### Flow

```mermaid
graph TD
    A["Push to main"] --> B["Checkout with full history"]
    B --> C["Resolve release PR from commit"]
    C --> D{"Merged PR with<br/>'release' label found?"}
    D --> |"No"| E["Skip: not a release commit"]
    D --> |"Yes"| F["Setup Node.js 20 with npm registry"]
    F --> G{"NPM_TOKEN available?"}
    G --> |"No: set enabled=false"| H["Continue without publish"]
    G --> |"Yes: set enabled=true"| H
    H --> I["Extract and validate version"]
    I --> J["Generate runtime adapters"]
    J --> K{"Adapter drift?"}
    K --> |"Yes"| L["Fail: adapters out of sync"]
    K --> |"No"| M["Run full test suite"]
    M --> N{"Tests pass?"}
    N --> |"No"| O["Fail: test failures"]
    N --> |"Yes"| P["Create and push Git tag<br/>vX.Y.Z"]
    P --> Q["Extract CHANGELOG<br/>for this version"]
    Q --> R["Create GitHub Release<br/>with CHANGELOG body"]
    R --> S{"Publish enabled?"}
    S --> |"No"| T["Skip npm publish"]
    S --> |"Yes"| U["Publish to npm<br/>--access public"]
    U --> V["Open back-merge PR<br/>main into dev"]
    T --> V
```

### Job Breakdown

**Job: `release`**

| Step | Description |
|------|-------------|
| Checkout | Full history (`fetch-depth: 0`) for tag operations |
| Resolve release PR from commit | Queries the GitHub API for PRs associated with the current commit SHA; filters for merged PRs targeting `main` with the `release` label. If none found, sets `is_release=false` and all subsequent steps are skipped. |
| Setup Node.js | Conditional on `is_release=true`; Node.js 20 with npm registry URL |
| Determine publish eligibility | Conditional on `is_release=true`; gates on `NPM_TOKEN` presence |
| Extract and validate version | Reads version from `package.json` and cross-validates: the CHANGELOG must have a matching section (unconditional). When the release branch name matches `release/vX.Y.Z` and the PR title matches `release: vX.Y.Z`, their embedded versions must agree with `package.json`. |
| Generate runtime adapters | Runs `node scripts/generate.js` |
| Check adapter drift | Final drift check before release; fails with error annotation |
| Run full test suite | Final test gate before release |
| Create and push tag | Creates Git tag `vX.Y.Z` at the merge commit SHA; handles idempotency (skips if tag exists at same SHA, fails if tag exists at different SHA) |
| Extract changelog | Extracts the version-specific section from `CHANGELOG.md` using `awk` |
| Create GitHub Release | Uses `softprops/action-gh-release` (pinned to SHA `c95fe1489396fe8a9eb87c0abf8aa5b2ef267fda`, v2.2.1) with CHANGELOG excerpt as body |
| Publish to npm | Publishes stable release with `npm publish --access public` (no dist-tag, so it becomes `latest`) |
| Open back-merge PR | Creates a PR from `main` into `dev` titled `chore: back-merge vX.Y.Z into dev`; skips if one already exists |

### Environment and Secrets

| Item | Type | Purpose |
|------|------|---------|
| `NPM_TOKEN` | Secret | npm registry authentication for stable publish |
| `NODE_AUTH_TOKEN` | Env (derived) | Set to `$NPM_TOKEN` for npm CLI |
| `GH_TOKEN` | Env (derived) | Set to `${{ github.token }}` for PR creation and GitHub API calls |

**Permissions**: `contents: write`, `pull-requests: write`

### Artifacts

- Git tag `vX.Y.Z` pushed to origin
- GitHub Release with CHANGELOG body
- Stable npm package `@maestro-orchestrator/maestro@X.Y.Z` published with the `latest` dist-tag
- Back-merge PR from `main` into `dev`

### Key Behaviors

- The release detection uses the GitHub API to find the PR associated with the merge commit, filtering for the `release` label. Non-release pushes to `main` exit early and cleanly.
- Version validation cross-checks `package.json` against the CHANGELOG (unconditional) and, when applicable, against the release branch name (`release/vX.Y.Z`) and the PR title (`release: vX.Y.Z`). A mismatch in any available source fails the workflow.
- Tag creation is idempotent: if the tag already exists at the same commit, the step is skipped. If it exists at a different commit, the workflow fails to prevent overwriting a release.
- The back-merge PR uses the default `GITHUB_TOKEN` (not `RELEASE_TOKEN`) since no downstream workflow trigger is needed.
- Back-merge creation checks for existing open PRs from `main` to `dev` before opening a new one.

---

## Build Commands

The `justfile` provides local development commands that mirror CI behavior.

### Command Reference

| Command | Description | CI Equivalent |
|---------|-------------|---------------|
| `just generate` | Generate all runtime files from `src/` | Used in all 6 workflows |
| `just dry-run` | Preview changes without writing | No CI equivalent |
| `just diff` | Show unified diff of pending changes | No CI equivalent |
| `just clean` | Delete generated files and regenerate from scratch | No CI equivalent |
| `just test` | Run all tests (unit + transform + integration) | Used in all 6 workflows |
| `just test-unit` | Run only unit tests | No CI equivalent |
| `just test-transforms` | Run only transform unit tests | No CI equivalent |
| `just test-integration` | Run only integration tests | No CI equivalent |
| `just check` | Generate + verify zero drift | Replicated in all 6 workflows |
| `just check-layers` | Verify `lib/` layer boundary imports | No CI workflow equivalent |
| `just ci` | Full CI equivalent: `check` + `check-layers` + `test` | Superset of CI (includes `check-layers`) |
| `just cleanup-branches` | Delete local branches whose remote is gone | No CI equivalent |

### CI Mapping

The workflows replicate the following `just` commands:

```
just generate  -->  node scripts/generate.js
just check     -->  git diff --exit-code --name-only (after generate)
just test      -->  node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js
```

The local `just ci` recipe runs `check`, `check-layers`, and `test`. The GitHub workflows run `generate`, drift check, and `test`, but do not run `check-layers` (`node scripts/check-layer-boundaries.js`). The layer boundary check is a local-only validation.

---

## Workflow Relationships

### Release Pipeline Chain

The release pipeline is a multi-workflow chain where each stage triggers the next through Git events and PR labels.

```mermaid
graph LR
    A["Developer triggers<br/>Prepare Release<br/>on dev branch"] --> B["Prepare Release<br/>creates release/vX.Y.Z"]
    B --> C["PR to dev<br/>auto-merged"]
    B --> D["PR to main<br/>labeled 'release' + 'rc'"]
    D --> E["Source Of Truth Check<br/>runs on PR"]
    D --> F["Release Candidate<br/>publishes X.Y.Z-rc.N"]
    F --> |"RC validated<br/>PR merged to main"| G["Release<br/>publishes X.Y.Z"]
    G --> H["Back-merge PR<br/>main into dev"]
```

### Step-by-Step Release Flow

1. A maintainer manually triggers **Prepare Release** from the `dev` branch (optionally specifying a version).
2. The workflow validates `dev` (drift check, tests, CHANGELOG content), creates a `release/vX.Y.Z` branch, bumps version files, and pushes the branch.
3. Two PRs are opened:
   - **PR to `dev`**: carries the version bump back into `dev`, auto-merge is enabled immediately.
   - **PR to `main`**: the release PR, labeled with `release` and `rc`, containing the CHANGELOG excerpt.
4. The release PR triggers **Source Of Truth Check** (standard CI on PRs to `main`).
5. The `release` + `rc` labels on a PR from `release/v*` to `main` trigger the **Release Candidate** workflow, which publishes an RC to npm.
6. If additional commits are pushed to the release branch, both Source Of Truth Check and Release Candidate re-run (RC number auto-increments).
7. When the release PR is merged to `main`, the push event triggers **Release**.
8. Release detects the merged release PR via the GitHub API, validates version consistency, runs final checks, creates a Git tag, publishes a GitHub Release, publishes to npm, and opens a back-merge PR from `main` to `dev`.

### Branch Strategy

```mermaid
graph LR
    A["dev<br/>primary development"] --> |"Prepare Release"| B["release/vX.Y.Z<br/>short-lived"]
    B --> |"Auto-merge PR"| A
    B --> |"Release PR"| C["main<br/>stable releases"]
    C --> |"Back-merge PR"| A
```

| Branch | Purpose | Protected |
|--------|---------|-----------|
| `dev` | Primary development branch; all feature work merges here | Yes (CI required) |
| `main` | Stable release branch; only receives release PRs | Yes (CI required) |
| `release/vX.Y.Z` | Short-lived release branches created by Prepare Release | Transient |

### Permissions and Secrets Summary

| Workflow | Permissions | Secrets |
|----------|-------------|---------|
| Source Of Truth Check | Default (read) | None |
| Nightly Build | `contents: read` | `NPM_TOKEN` |
| Preview Build | `contents: read`, `pull-requests: write` | `NPM_TOKEN` |
| Prepare Release | `contents: write`, `pull-requests: write` | `RELEASE_TOKEN` |
| Release Candidate | `contents: read`, `pull-requests: write` | `NPM_TOKEN` |
| Release | `contents: write`, `pull-requests: write` | `NPM_TOKEN` |

The `RELEASE_TOKEN` used by Prepare Release is a personal access token with elevated permissions. The default `GITHUB_TOKEN` does not trigger downstream workflow runs, so `RELEASE_TOKEN` is required for branch pushes and PR creation that need to activate Source Of Truth Check and Release Candidate on the newly created PR.

### npm Dist-Tags

| Tag | Source | Version Pattern | Workflow |
|-----|--------|-----------------|----------|
| `latest` | Stable release from `main` | `X.Y.Z` | Release |
| `rc` | Release candidate from release PR | `X.Y.Z-rc.N` | Release Candidate |
| `preview` | PR preview build | `X.Y.Z-preview.SHORT_SHA` | Preview Build |
| `nightly` | Daily dev snapshot | `X.Y.Z-nightly.YYYYMMDD` | Nightly Build |
