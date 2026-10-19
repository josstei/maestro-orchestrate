# Maestro for Codex

This directory contains the generated Codex runtime for Maestro.

## Installation

1. Register the marketplace:

   ```bash
   codex plugin marketplace add josstei/maestro-orchestrate
   ```

2. Start Codex (or restart if already open), run `/plugins` to browse, select **Maestro**, and choose **Install**.

For local development (path must start with `./`, `../`, `/`, or `~/` — Codex otherwise treats bare `owner/repo` as a GitHub source):

```bash
git clone https://github.com/josstei/maestro-orchestrate
codex plugin marketplace add /absolute/path/to/maestro-orchestrate
# then: start Codex, run `/plugins`, select Maestro → Install
```

## Architecture

Codex shares the same canonical `src/` source tree as the Antigravity, Claude Code, and Qwen Code outputs:
- shared methodology, references, templates, hooks, and MCP server logic are authored only in `src/`
- this plugin contains public entry skills, manifests, and a generated `./src/` runtime payload derived from canonical `src/`
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

- Shared methodology, references, templates, and agent bodies are authored in root `src/` and mirrored into generated `./src/`. The MCP server runs from the versioned `@josstei/maestro` npm package via `npx` and serves this content from that package's `src/`.
- Maestro session state lives in `docs/maestro` in the workspace root.
- The workspace root is the path the orchestrator passes to `initialize_workspace`. To suggest it, the MCP server's `get_runtime_context` reports `MAESTRO_WORKSPACE_PATH` when the host exports it, otherwise the first `file://` root from the MCP client `roots/list` response, otherwise the server's `cwd`.
- The plugin ships `.mcp.json` for MCP-first operation, but the generated skills also include direct filesystem fallbacks under `docs/maestro` when MCP tools are unavailable.
- Custom Codex subagents normally live in `.codex/agents`. This plugin does not write there; `get_agent` serves the canonical methodology bodies directly.
- Codex keeps its built-in `/review`, `/debug`, and `/resume` commands; Maestro exposes `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` to avoid those collisions.

## Alignment goal

Codex is treated as one of four generated runtimes, not a separate implementation. If behavior changes, update shared `src/` first and regenerate.
