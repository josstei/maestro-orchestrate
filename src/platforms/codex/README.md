# Maestro for Codex

This directory is the generated Codex runtime for Maestro.

Codex shares the same canonical `src/` source tree as the Gemini CLI and Claude Code outputs:
- shared methodology, references, templates, hooks, and MCP server logic are authored only in `src/`
- this plugin contains public entry skills, manifests, and thin adapters that resolve back into canonical `src/`
- Codex-specific behavior is isolated to this plugin's runtime guide and public entry skills, exposed under the plugin namespace as `$maestro:<skill>`
- agent personas are generated under `./agents/` as reference documents so Codex delegation stays aligned without creating a hand-maintained fork

## Public skills

- `orchestrate`
- `execute`
- `resume`
- `status`
- `archive`
- `review`
- `debug`
- `security-audit`
- `perf-check`
- `seo-audit`
- `a11y-audit`
- `compliance-check`

## Runtime notes

- Shared methodology, references, templates, and agent bodies are served from canonical `src/` through the MCP adapter when MCP is available.
- Maestro session state lives in `docs/maestro` in the workspace root.
- The plugin ships `.mcp.json` for MCP-first operation, but the generated skills also include direct filesystem fallbacks under `docs/maestro` when MCP tools are unavailable.
- Custom Codex subagents normally live in `.codex/agents`. This plugin does not write there. Instead, it ships `./agents/*.md` as registration stubs while `get_agent` serves the canonical methodology bodies.

## Alignment goal

Codex is treated as a third generated runtime, not a separate implementation. If behavior changes, update shared `src/` first and regenerate.
