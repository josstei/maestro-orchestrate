# Maestro for Codex

This directory is the generated Codex runtime for Maestro.

It follows the same source-of-truth model as the existing Gemini CLI and Claude Code outputs:
- shared methodology, references, templates, scripts, and MCP server source are generated from `src/`
- Codex-specific behavior is isolated to this plugin's runtime guide and public `maestro-*` entry skills
- agent personas are generated under `./agents/` as reference documents so Codex delegation stays aligned without creating a hand-maintained fork

## Public skills

- `maestro-orchestrate`
- `maestro-execute`
- `maestro-resume`
- `maestro-status`
- `maestro-archive`
- `maestro-review`
- `maestro-debug`
- `maestro-security-audit`
- `maestro-perf-check`
- `maestro-seo-audit`
- `maestro-a11y-audit`
- `maestro-compliance-check`

## Runtime notes

- Shared methodology, references, and templates are served from canonical `src/` content via MCP.
- Maestro session state lives in `docs/maestro` in the workspace root.
- The plugin ships `.mcp.json` for MCP-first operation, but the generated skills also include script/file fallbacks when MCP tools are unavailable.
- Custom Codex subagents normally live in `.codex/agents`. This plugin does not write there. Instead, it ships `./agents/*.md` as registration stubs while `get_agent` serves the canonical methodology bodies.

## Alignment goal

Codex is treated as a third generated runtime, not a separate implementation. If behavior changes, update shared `src/` first and regenerate.
