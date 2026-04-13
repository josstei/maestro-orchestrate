# Contributing to Maestro

Thank you for your interest in contributing to Maestro. This guide covers everything you need to get started.

## Prerequisites

- **Node.js 18+**
- **One supported runtime**: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), or [Codex](https://github.com/openai/codex)
- [Just](https://github.com/casey/just) command runner (optional but recommended)

## Development Setup

```bash
git clone https://github.com/josstei/maestro-orchestrate.git
cd maestro-orchestrate
npm install
```

## Key Commands

All commands are available via `just` or `npm`:

| Command | Description |
|---------|-------------|
| `just generate` | Generate all runtime files from `src/` |
| `just test` | Run all tests (unit + transform + integration) |
| `just test-unit` | Run only unit tests |
| `just test-transforms` | Run only transform unit tests |
| `just test-integration` | Run only integration tests |
| `just check` | Generate + verify zero drift (`git diff --exit-code`) |
| `just ci` | Full CI equivalent: check + test |
| `just dry-run` | Preview changes without writing |
| `just diff` | Show unified diff of pending changes |

Equivalent npm scripts: `npm run generate` or `npm run build`.

## Architecture: Canonical Source and Generated Runtimes

All hand-maintained code lives in `src/`. Everything outside `src/` at the runtime output locations is **generated** by the build pipeline.

**Never hand-edit generated files.** They will be overwritten on the next `just generate`.

| Generated Location | Runtime |
|--------------------|---------|
| `agents/`, `commands/`, `hooks/`, `mcp/`, `policies/` (repo root) | Gemini CLI |
| `claude/` | Claude Code |
| `plugins/maestro/` | Codex |

The generator pipeline reads `src/manifest.js` and applies transforms from `src/transforms/` to produce runtime-specific output.

## Making Changes

1. **Branch from `main`**:
   ```bash
   git checkout -b your-branch-name main
   ```

2. **Make your changes in `src/`** — edit only canonical source files.

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

## Commit Conventions

This project uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. When your change is user-facing, add an entry under the `[Unreleased]` section in `CHANGELOG.md` with the appropriate category (`Added`, `Changed`, `Fixed`, `Removed`).

## Pull Request Process

1. Fill out the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
2. Ensure CI passes — the `generator-check` workflow verifies zero drift and runs the full test suite.
3. Link any related issues.
4. A maintainer will review your PR. Address feedback and keep the branch up to date with `main`.

## Reporting Bugs and Requesting Features

Use the [issue templates](.github/ISSUE_TEMPLATE/) to file bug reports or feature requests. Include your runtime (Gemini CLI, Claude Code, or Codex), Node.js version, and steps to reproduce.

## Code Review

All submissions require review before merging. Reviewers check for:

- Correctness and completeness
- Adherence to the canonical-source architecture
- Test coverage for new or changed behavior
- Zero drift after regeneration

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
