# Maestro for Codex

This directory is the generated Codex runtime for Maestro.

## Installation

1. Register the marketplace:

   ```bash
   codex marketplace add josstei/maestro-orchestrate
   ```

2. Start Codex, run `/plugins`, and select **Maestro** → **Install**.

For local development:

```bash
git clone https://github.com/josstei/maestro-orchestrate
codex marketplace add /path/to/maestro-orchestrate
```

## Architecture

Codex shares the same canonical `src/` source tree as the Gemini CLI and Claude Code outputs:
- shared methodology, references, templates, hooks, and MCP server logic are authored only in `src/`
- this plugin contains public entry skills, manifests, thin adapters, and a generated `./src/` runtime payload derived from canonical `src/`
- Codex-specific behavior is isolated to this plugin's runtime guide and public entry skills, exposed under the plugin namespace as `$maestro:<skill>`
- Codex does not consume plugin agent files; Maestro serves agent methodology through MCP `get_agent`

## Public skills

- `orchestrate`
- `execute`
- `resume-session`
- `status`
- `archive`
- `review-code`
- `debug-workflow`
- `security-audit`
- `perf-check`
- `seo-audit`
- `a11y-audit`
- `compliance-check`

## Runtime notes

- Shared methodology, references, templates, and agent bodies are authored in root `src/` and mirrored into generated `./src/` for detached Codex installs.
- Maestro session state lives in `docs/maestro` in the workspace root.
- Codex resolves that workspace root from `MAESTRO_WORKSPACE_PATH` when available, otherwise from the MCP client `roots/list` response, before falling back to legacy env or `cwd` detection.
- The plugin ships `.mcp.json` for MCP-first operation, but the generated skills also include direct filesystem fallbacks under `docs/maestro` when MCP tools are unavailable.
- Custom Codex subagents normally live in `.codex/agents`. This plugin does not write there; `get_agent` serves the canonical methodology bodies directly.
- Codex keeps its built-in `/review`, `/debug`, and `/resume` commands; Maestro exposes `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` to avoid those collisions.

## Alignment goal

Codex is treated as a third generated runtime, not a separate implementation. If behavior changes, update shared `src/` first and regenerate.
