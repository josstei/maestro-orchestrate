# Contributing to Maestro

Thank you for your interest in contributing to Maestro. This guide covers everything you need to get started.

## Prerequisites

- **Node.js 20+**
- **One supported runtime**: [Antigravity](antigravity/README.md), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), or [Qwen Code](https://github.com/QwenLM/qwen-code)
- [Just](https://github.com/casey/just) command runner (optional but recommended)

## Development Setup

```bash
git clone https://github.com/josstei/maestro-orchestrate.git
cd maestro-orchestrate
npm ci
```

`npm ci` installs the locked dependencies only. Local git hook activation is explicit so package, pack, and publish flows do not mutate hook configuration. To activate the repo-local `pre-commit`, `commit-msg`, and `pre-push` hooks for this checkout, run:

```bash
npm run install-hooks
```

Equivalent manual command: `git config core.hooksPath .githooks`.

The hooks are best-effort — `pre-push` skips its source-of-truth check when `node` or the `npm ci` dev dependencies are missing, and CI re-validates everything on PR submission and on direct pushes to `main`.

## Key Commands

All commands are available via `just`:

| Command | Description | CI equivalent |
|---------|-------------|---------------|
| `just generate` | Generate all runtime files from `src/` | Regenerates after a version bump in Prepare Release and the prerelease publish steps |
| `just test` | Run all tests (unit + transform + integration) | `npm test` in all 6 source-of-truth workflows |
| `just test-unit` | Run only unit tests | — |
| `just test-transforms` | Run only transform unit tests | — |
| `just test-integration` | Run only integration tests | — |
| `just check` | Generate, then fail if `git diff --exit-code` shows drift | All 6 source-of-truth workflows run `node scripts/generate.js --check` |
| `just check-layers` | Parse the production graph; verify layer boundaries, dependency containment, and absence of cycles | Covered by `npm test`, which runs `scripts/check-layer-boundaries.js` against the repository's `src/` |
| `just ci` | Full CI equivalent: check + test + npm package and release archive verification | The `source-of-truth-check` job after `npm ci` |
| `just dry-run` | Preview changes without writing | — |
| `just diff` | Show unified diff of pending changes | — |
| `just clean` | Delete the generated agent and shared-skill stubs, then regenerate | — |
| `just cleanup-branches` | Delete local branches whose remote is gone | — |

npm equivalents: `npm run generate` or `npm run build` for `just generate`, and `npm test` for `just test`. [docs/cicd.md](docs/cicd.md) describes each workflow.

## Architecture: Canonical Source and Generated Runtimes

Shared code and content live in `src/`. The generator (`just generate`) builds runtime files, including the public launchers, from it; runtime guides and READMEs are maintained by hand.

**Never hand-edit generated files.** They will be overwritten on the next `just generate`.

| Generated (edit the source in `src/` instead) | Runtime |
|-----------------------------------------------|---------|
| `antigravity/agents/`, `antigravity/skills/`, `antigravity/plugin.json`, `antigravity/mcp_config.json`, `antigravity/hooks.json`, `antigravity/src/` | Antigravity |
| `claude/agents/`, `claude/skills/`, `claude/hooks/claude-hooks.json`, `claude/.claude-plugin/plugin.json`, `claude/.mcp.json`, `claude/src/`, `.claude-plugin/marketplace.json` | Claude Code |
| `plugins/maestro/skills/`, `plugins/maestro/.codex-plugin/plugin.json`, `plugins/maestro/.mcp.json`, `plugins/maestro/.app.json`, `plugins/maestro/src/`, `.agents/plugins/marketplace.json` | Codex |
| `agents/`, `qwen/hooks.json`, `qwen-extension.json`, `commands/maestro/`, `policies/maestro.toml` | Qwen Code |
| `src/generated/*.json` (agent, resource, and hook registries) | All |
| `hooks/hook-runner.js`, `mcp/maestro-server.js` | Qwen Code launchers |
| `antigravity/mcp/maestro-server.js`, `antigravity/hooks/hook-runner.js`, `antigravity/hooks/policy-enforcer.js` | Antigravity launchers |
| `claude/mcp/maestro-server.js`, `claude/scripts/hook-runner.js`, `claude/scripts/policy-enforcer.js` | Claude Code launchers |
| `bin/maestro-mcp-server.js` | Codex npm executable |

`antigravity/src/`, `claude/src/`, and `plugins/maestro/src/` contain dependency closures and explicit content roots from `src/`, stamped with `version.json`, for installs outside the repo. Install the locked development dependencies with `npm ci` before generation or architecture checks; Acorn and Acorn Walk never enter detached payloads. New dynamic loaders need an explicit supported dependency classification; apparent orphan modules require review rather than automatic deletion.

Launchers are rendered by `src/generator/runtime-entrypoints.js`. Their public paths and repo-first, bundled-fallback loading remain stable. Generation also restores the executable mode of the Codex npm bin.

| Hand-maintained (edit in place) | Purpose |
|---------------------------------|---------|
| `plugins/maestro/references/runtime-guide.md` | Codex runtime guide, read by the Codex skills |
| `QWEN.md` | Qwen Code context file |
| `README.md`, `antigravity/README.md`, `claude/README.md`, `plugins/maestro/README.md` | READMEs; `scripts/update-versions.js` stamps the version badge in `README.md` and `claude/README.md` |

The generator collects agent and shared-skill stubs through `src/generator/stub-outputs.js` and the renderers in `src/transforms/`, expands the entry-point registries, and builds the manifests and hook registrations in `src/platforms/metadata.js` and the Qwen policy pack in `src/platforms/qwen/policy-pack.js`. [docs/architecture.md](docs/architecture.md#generator-pipeline) lists every step.

## Making Changes

1. **Branch from `main`**:
   ```bash
   git checkout -b feat/short-description main
   ```

2. **Make your changes in `src/`** — edit canonical source files, plus the hand-maintained files listed above when needed.

3. **Regenerate runtime output**:
   ```bash
   just generate
   ```

4. **Run tests**:
   ```bash
   just test
   ```

5. **Commit your changes**, including the regenerated files.

6. **Verify zero drift, then push** — CI enforces that generated output matches what is committed. `just check` regenerates and fails on any unstaged change, so run it after committing:
   ```bash
   just check
   ```

## Semantic Git Conventions

### Branch format

Branch names must use a semantic type prefix. The local `pre-commit` and `pre-push` hooks enforce this, and the `Commit Message Check` CI workflow validates PR branch names.

```
<type>/<slug>
<namespace>/<type>/<slug>
release/vX.Y.Z
```

Use the same type vocabulary as commit subjects, except release branches use the fixed `release/vX.Y.Z` format. Slugs are lowercase and may contain numbers, dots, underscores, and hyphens. A namespace is allowed for tool or user prefixes such as `codex/`.

Examples that pass:

- `feat/mcp-session-cache`
- `fix/pre-push-range`
- `codex/chore/enforce-git-conventions`
- `release/v1.7.0`

### Subject format

Commit subjects must follow [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/). The local `commit-msg` hook and the `Commit Message Check` CI workflow both enforce this; PR titles are also validated since this repo squash-merges.

```
<type>(<optional-scope>)<!>: <description>
```

| Type | Use for |
|------|---------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `chore` | Housekeeping — config, deps, tooling, generated files |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `refactor` | Structural change with no behaviour change |
| `perf` | Performance improvement |
| `style` | Formatting only (no code change) |
| `build` | Build system or external dependencies |
| `ci` | CI configuration |
| `revert` | Reverts a previous commit |
| `release` | Version bump or release prep |

Scope is lowercase and parenthesised — e.g. `(api)`, `(core)`, `(mcp)`, `(generator)`. Append `!` before the colon to mark a breaking change.

Examples that pass:

- `feat(api): add idempotency-key header`
- `fix(core): reject on malformed JSON instead of crashing`
- `chore(deps): bump c8 to ^10.1.4`
- `feat(auth)!: drop legacy session-token support`
- `release: v1.7.0`

Git-generated subjects pass through both hook and CI without rewriting: `Merge ...`, `Revert ...`, `fixup! ...`, `squash! ...`, `amend! ...`.

If the hook rejects a commit, your message body is preserved in `.git/COMMIT_EDITMSG`:

```bash
git commit --edit --file=.git/COMMIT_EDITMSG
```

To rewrite earlier commits already on a branch:

```bash
git rebase -i origin/main    # change 'pick' to 'reword' on each bad commit
```

### Changelog

This project uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. When your change is user-facing, add an entry under the `[Unreleased]` section in `CHANGELOG.md` with the appropriate category (`Added`, `Changed`, `Fixed`, `Removed`).

## Pull Request Process

1. Fill out the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
2. Ensure CI passes — the Source Of Truth Check workflow (`.github/workflows/generator-check.yml`) verifies zero drift and runs the full test suite, and the Commit Message Check workflow validates the branch name, PR title, and commit subjects.
3. Link any related issues.
4. A maintainer will review your PR. Address feedback and keep the branch up to date with `main`.

## Reporting Bugs and Requesting Features

Use the [issue templates](.github/ISSUE_TEMPLATE/) to file bug reports or feature requests. Include your runtime (Antigravity, Claude Code, Codex, or Qwen Code), Node.js version, and steps to reproduce.

## Code Review

All submissions require review before merging. Reviewers check for:

- Correctness and completeness
- Adherence to the canonical-source architecture
- Test coverage for new or changed behavior
- Zero drift after regeneration

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
