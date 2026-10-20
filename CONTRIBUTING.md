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
npm install
```

`npm install` installs dependencies only. Local git hook activation is explicit so package, pack, and publish flows do not mutate hook configuration. To activate the repo-local `pre-commit`, `commit-msg`, and `pre-push` hooks for this checkout, run:

```bash
npm run install-hooks
```

Equivalent manual command: `git config core.hooksPath .githooks`.

The hooks are best-effort — CI re-validates everything on PR submission and on direct pushes to `main`.

## Key Commands

All commands are available via `just`:

| Command | Description |
|---------|-------------|
| `just generate` | Generate all runtime files from `src/` |
| `just test` | Run all tests (unit + transform + integration) |
| `just test-unit` | Run only unit tests |
| `just test-transforms` | Run only transform unit tests |
| `just test-integration` | Run only integration tests |
| `just check` | Generate + verify zero drift (`git diff --exit-code`) |
| `just check-layers` | Verify that `src/lib/` imports only `src/lib/` and `node:` builtins |
| `just ci` | Full CI equivalent: check + check-layers + test |
| `just dry-run` | Preview changes without writing |
| `just diff` | Show unified diff of pending changes |
| `just clean` | Delete the generated agent and shared-skill stubs, then regenerate |
| `just cleanup-branches` | Delete local branches whose remote is gone |

npm equivalents: `npm run generate` or `npm run build` for `just generate`, and `npm test` for `just test`.

## Architecture: Canonical Source and Generated Runtimes

Shared code and content live in `src/`. The generator (`just generate`) builds most of each runtime's files from it; a few runtime files are thin shims or docs maintained by hand.

**Never hand-edit generated files.** They will be overwritten on the next `just generate`.

| Generated (edit the source in `src/` instead) | Runtime |
|-----------------------------------------------|---------|
| `antigravity/agents/`, `antigravity/skills/`, `antigravity/plugin.json`, `antigravity/mcp_config.json`, `antigravity/hooks.json`, `antigravity/src/` | Antigravity |
| `claude/agents/`, `claude/skills/`, `claude/hooks/claude-hooks.json`, `claude/.claude-plugin/plugin.json`, `claude/.mcp.json`, `claude/src/`, `.claude-plugin/marketplace.json` | Claude Code |
| `plugins/maestro/skills/`, `plugins/maestro/.codex-plugin/plugin.json`, `plugins/maestro/.mcp.json`, `plugins/maestro/.app.json`, `plugins/maestro/src/`, `.agents/plugins/marketplace.json` | Codex |
| `agents/`, `qwen/hooks.json`, `qwen-extension.json`, `commands/maestro/`, `policies/maestro.toml` | Qwen Code |
| `src/generated/*.json` (agent, resource, and hook registries) | All |

`antigravity/src/`, `claude/src/`, and `plugins/maestro/src/` are detached copies of `src/`, stamped with `version.json`, for installs outside the repo.

| Hand-maintained (edit in place) | Purpose |
|---------------------------------|---------|
| `hooks/hook-runner.js`, `mcp/maestro-server.js` | Qwen Code shims that load the hook runner and MCP server from `src/` |
| `antigravity/mcp/maestro-server.js`, `antigravity/hooks/hook-runner.js`, `antigravity/hooks/policy-enforcer.js` | Antigravity shims that load the repo `src/`, or the bundled `antigravity/src/` outside the repo |
| `claude/scripts/hook-runner.js`, `claude/scripts/policy-enforcer.js`, `claude/mcp/maestro-server.js` | Claude Code shims that load the repo `src/`, or the bundled `claude/src/` outside the repo |
| `bin/maestro-mcp-server.js` | Codex MCP server bin, run via `npx` from `plugins/maestro/.mcp.json` |
| `claude/mcp-config.example.json` | Example MCP server entry for manual Claude setups |
| `plugins/maestro/references/runtime-guide.md` | Codex runtime guide, read by the Codex skills |
| `QWEN.md` | Qwen Code context file |
| `README.md`, `antigravity/README.md`, `claude/README.md`, `plugins/maestro/README.md` | READMEs; `scripts/update-versions.js` stamps the version badge in `README.md` and `claude/README.md` |

The generator reads `src/generator/manifest.js`, applies the transforms in `src/generator/transforms/`, expands the entry-point registries, and builds the manifests and hook registrations in `src/platforms/metadata.js` and the Qwen policy pack in `src/platforms/qwen/policy-pack.js`. [docs/architecture.md](docs/architecture.md#generator-pipeline) lists every step.

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

5. **Verify zero drift** — CI enforces that generated output matches what is committed:
   ```bash
   just check
   ```

6. **Commit and push** your branch.

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
