# Maestro for Antigravity

This directory is the Maestro plugin for Google Antigravity: the Antigravity CLI (`agy`) and the Antigravity app, which share one plugin format. It is generated from the repository's canonical `src/` tree, except for this README and the shims in `mcp/` and `hooks/`.

## Installation

Requires Node.js 20+ on `PATH`. Maestro is tested against Antigravity CLI 1.4.2.

```bash
agy plugin install https://github.com/josstei/maestro-orchestrate/tree/main/antigravity
```

Restart `agy` afterwards: Antigravity discovers a newly installed plugin directory only on startup. Check the result with `agy plugin list`. To update, run the same install command again; it replaces the installed copy and keeps your enable/disable choice. Remove the plugin with `agy plugin uninstall maestro`.

The plugin is installed to `~/.gemini/config/plugins/maestro/`. Plugins you install in the Antigravity app also appear in the CLI.

For local development, link this directory instead of copying it, then restart `agy`:

```bash
git clone https://github.com/josstei/maestro-orchestrate
mkdir -p ~/.gemini/config/plugins
ln -s "$PWD/maestro-orchestrate/antigravity" ~/.gemini/config/plugins/maestro
```

A linked plugin loads at startup but is not listed by `agy plugin list`.

## Skills

Every public skill is a slash command under the plugin namespace:

- `/maestro:orchestrate`
- `/maestro:execute`
- `/maestro:resume-session`
- `/maestro:status`
- `/maestro:archive`
- `/maestro:review-code`
- `/maestro:debug-workflow`
- `/maestro:security-audit`
- `/maestro:perf-check`
- `/maestro:seo-audit`
- `/maestro:a11y-audit`
- `/maestro:compliance-check`

Antigravity has a built-in `/resume`, so Maestro uses `resume-session`, `review-code`, and `debug-workflow`, as in Claude Code and Codex. The shared methodology skills (`delegation`, `execution`, and the rest) set `disable-slash-command: true`: the agent can load them, but they stay out of the `/` menu.

## What the plugin contains

| Path | Purpose |
|------|---------|
| `plugin.json` | Plugin manifest (name, display name, version, description, suggested prompts) |
| `mcp_config.json` | Starts the Maestro MCP server with `node ${PLUGIN_ROOT}/mcp/maestro-server.js` |
| `hooks.json` | SessionStart session-context hooks and the `run_command` shell policy |
| `agents/` | 39 subagents, one per Maestro specialist |
| `skills/` | 12 public skills and 7 shared methodology skills |
| `src/` | Bundled copy of the canonical `src/` tree, so an installed copy runs on its own |

## Runtime notes

- **MCP tools**: Antigravity registers the server as `maestro_maestro`. Maestro marks every tool always-loaded, so the agent calls them as native tools named `mcp_maestro_maestro_<tool>`. If Antigravity asks before each Maestro tool call, allow them with `"mcp(maestro_maestro/*)"` under `permissions.allow` in `~/.gemini/antigravity-cli/settings.json`.
- **Delegation**: the orchestrator delegates with `invoke_subagent`, using the specialist name as `TypeName` (for example `coder`). Each subagent reports back as a message when it finishes, so batches run in parallel without polling. Antigravity lists custom subagents for the app and the CLI; the IDE does not run them yet.
- **Workspace**: the MCP server suggests the first workspace root Antigravity reports, unless `MAESTRO_WORKSPACE_PATH` is set. Session state lives in `docs/maestro/` in that workspace.
- **Settings**: Antigravity plugins have no settings form. Export `MAESTRO_*` variables before starting `agy`, or put them in the workspace `.env`.
- **Hooks**: Antigravity has no session-end or post-delegation event. A SessionStart hook adds the active Maestro session's phase and status to the main conversation and to each subagent conversation. The orchestrator checks every handoff report itself and asks a subagent once to resend a malformed one.
- **Shell policy**: a PreToolUse hook on `run_command` applies Maestro's shell rules to each command segment and subshell. A segment that starts with `rm -rf`, `git reset --hard`, `git checkout --` or `git clean -fd` (or a flag-reordered form), or that contains a heredoc, is denied. `tee` and spaced output redirects (`>`, `>>`) prompt for confirmation even when your `permissions.allow` covers the command, unless you run with `--dangerously-skip-permissions`. Every other command keeps your own permission settings. The rules are guardrails, not a sandbox.
- **Plan Mode**: Antigravity exposes no plan-mode tools to the agent, so Maestro's server-side design gate and `ask_question` approvals carry the design approval.

## Alignment goal

Antigravity is one of four generated runtimes, not a separate implementation. If behavior changes, update shared `src/` first and regenerate with `node scripts/generate.js`.
