# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maestro is a multi-agent development orchestration platform that coordinates 22 specialized AI agents through structured workflows. It runs as both a **Gemini CLI extension** (root directory) and a **Claude Code plugin** (`claude/` subdirectory). The orchestrator adopts a TechLead persona that designs, plans, delegates to agents, validates, and reports.

## Development Commands

```bash
# Regenerate runtime files from source
node scripts/generate.js

# Preview what would change
node scripts/generate.js --dry-run

# Show unified diff of changes  
node scripts/generate.js --diff

# Release: tag a version and push — GitHub Actions creates the release from CHANGELOG.md
git tag v1.x.y && git push origin v1.x.y
```

There is no build step, test suite, or linter. This is a content/configuration project (markdown, TOML, JSON, JS scripts).

## Dual-Runtime Architecture

The root directory serves the Gemini CLI extension. The `claude/` subdirectory is the Claude Code plugin. They share core logic but diverge on naming and environment resolution:

| Aspect | Gemini (root) | Claude (`claude/`) |
|--------|---------------|---------------------|
| Agent names | `snake_case` (e.g. `code_reviewer`) | `kebab-case` (e.g. `code-reviewer`) |
| Command prefix | `/maestro:orchestrate` | `/orchestrate` |
| Env vars | `MAESTRO_EXTENSION_PATH`, `MAESTRO_WORKSPACE_PATH` | `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR` |
| Manifest | `gemini-extension.json` | `claude/.claude-plugin/plugin.json` |

**Shared files** (`lib/core/`, `lib/state/`, `lib/hooks/`, `lib/config/`) are mirrored into `claude/lib/`. Two files have intentional patches for Claude env vars: `setting-resolver.js` and `project-root-resolver.js`. Run `./scripts/check-claude-lib-drift.sh` after editing any shared `lib/` file.

**Intentionally different** between runtimes: `templates/`, `references/`, `README.md`, agent definitions (naming conventions), and commands.

## Key Directories

- **`agents/`** — 22 agent definitions with YAML frontmatter (tools, temperature, max_turns, timeout) + prose methodology. Tool access is tiered (read-only → full access) per `lib/core/agent-registry.js`.
- **`commands/maestro/`** — Gemini CLI slash commands (TOML format). Claude equivalents are in `claude/commands/`.
- **`skills/`** — Methodology modules loaded on-demand per phase (design-dialogue, execution, validation, etc.). Each has a `SKILL.md` entry file.
- **`references/orchestration-steps.md`** — 40 numbered steps; the **sole procedural authority** for the orchestration workflow. Both runtimes load this at invocation time.
- **`mcp/maestro-server.js`** — Bundled MCP server (10 tools: session CRUD, workspace init, plan validation, settings resolution, skill content).
- **`scripts/`** — Node.js utilities for state I/O, workspace setup, and settings; used as fallback when MCP is unavailable.
- **`policies/maestro.toml`** — Shell guardrails: deny rules for destructive commands, ask rules for redirects.
- **`templates/`** — Canonical YAML+markdown formats for session state, design documents, and implementation plans.

## Architecture Patterns

**Workflow modes**: Express (simple tasks: clarify → delegate → review) and Standard (complex tasks: design → plan → execute → complete). Complexity classification determines which mode runs.

**State management**: MCP-first with filesystem fallback. Session state lives in `MAESTRO_STATE_DIR` (default `docs/maestro/`). Atomic writes via `lib/core/atomic-write.js`. Session IDs are validated to prevent path traversal.

**Settings resolution order**: exported env var → workspace `.env` → extension/plugin `.env` → defaults. Configured in `lib/config/setting-resolver.js`.

**Hooks**: Lifecycle middleware via JSON hook registrations (`hooks/hooks.json` for Gemini, `claude/hooks/claude-hooks.json` for Claude). Execute Node.js scripts on session start/end, before/after agent dispatch.

**Parallel execution**: `validate_plan` MCP tool detects parallelizable phases (same dependency depth, no file overlap). Execution mode configurable via `MAESTRO_EXECUTION_MODE` (parallel/sequential/ask).

## When Editing

- Edit files in `src/`, not in root or `claude/` directly. Run `node scripts/generate.js` after changes. Commit both source and generated output together.
- The CI drift check will fail if generated output doesn't match source.
- Agent frontmatter fields (`tools`, `temperature`, `max_turns`, `timeout`) are enforced at runtime — changing them affects agent behavior.
- `references/orchestration-steps.md` is the single source of truth for orchestration flow. Changes here affect both runtimes.
- The MCP server (`mcp/maestro-server.js`) is a bundled file. Its source of truth for tool schemas is the file itself.
