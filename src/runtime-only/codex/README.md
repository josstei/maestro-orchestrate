# Maestro for Codex

This directory is the generated Codex runtime for Maestro.

Codex shares the same canonical `src/` authoring source as the Gemini CLI and Claude Code outputs, but its packaged content model differs:
- shared methodology, references, templates, and MCP server source are generated from `src/`
- packaged shared content is served from bundled MCP registries first, with filesystem fallback reserved for repo-local and workspace scenarios
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

- Shared methodology, references, templates, and agent bodies are served via bundled MCP content registries generated from canonical `src/` content, with filesystem fallback reserved for repo-local and workspace scenarios.
- Maestro session state lives in `docs/maestro` in the workspace root.
- The plugin ships `.mcp.json` for MCP-first operation, but the generated skills also include direct filesystem fallbacks under `docs/maestro` when MCP tools are unavailable.
- Custom Codex subagents normally live in `.codex/agents`. This plugin does not write there. Instead, it ships `./agents/*.md` as registration stubs while `get_agent` serves the canonical methodology bodies.

## Alignment goal

Codex is treated as a third generated runtime, not a separate implementation. If behavior changes, update shared `src/` first and regenerate.
