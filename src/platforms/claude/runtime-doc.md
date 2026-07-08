# Claude Runtime

The Claude Code plugin is rooted at the package root and exposes Claude-specific runtime files under `claude/`.

## Configuration

**Manifest**: `.claude-plugin/plugin.json`
**Version**: generated from `package.json`
**Hooks**: `claude/hooks/claude-hooks.json`
**MCP Config**: `claude/.mcp.json`

### MCP Server

```json
{
  "mcpServers": {
    "maestro": {
      "command": "npx",
      "args": ["-y", "-p", "@josstei/maestro@<package version>", "maestro-mcp-server"],
      "env": { "MAESTRO_RUNTIME": "claude" }
    }
  }
}
```

The manifest launches the server via `npx` against the versioned `@josstei/maestro` npm package, with `MAESTRO_RUNTIME=claude`. The public `maestro-mcp-server` bin resolves to compiled `dist/src/bin/maestro-mcp-server.js`, which loads the compiled server from `dist/src/mcp/maestro-server.js`. The runtime-local `claude/mcp/maestro-server.js` adapter still ships for direct source-checkout and local-plugin use and also requires the compiled `dist/src` server. Claude declares `primary: filesystem` and `fallback: none`; shared skills, templates, references, and agent bodies are resolved from package-root `dist/src/`.

## Agent Naming

Claude uses **kebab-case** for agent names: `code-reviewer`, `api-designer`, `accessibility-specialist`.

Agent files are generated at `claude/agents/*.md` with kebab-case filenames.

## Delegation

Claude Code Agent subagent syntax:

```
Agent(subagent_type: "maestro:coder", prompt: "...")
Agent(subagent_type: "maestro:architect", prompt: "...")
```

## Skills

19 Markdown skills in `claude/skills/`:

**Core (3)** — generated public entry points from the core command registry:
- `orchestrate/SKILL.md`
- `execute/SKILL.md`
- `resume-session/SKILL.md`

**Entry-point (9)** — from registry (`review`, `debug`, `resume` are remapped to `review-code`, `debug-workflow`, `resume-session` because they collide with Claude Code built-in commands; see `src/generator/entry-point-expander.ts` `HOST_RESERVED_NAMES`):
- `review-code/SKILL.md`, `debug-workflow/SKILL.md`, `archive/SKILL.md`, `status/SKILL.md`
- `security-audit/SKILL.md`, `perf-check/SKILL.md`, `seo-audit/SKILL.md`
- `a11y-audit/SKILL.md`, `compliance-check/SKILL.md`

**Infrastructure (7)** — discovery stubs for shared skills:
- `code-review/SKILL.md`, `delegation/SKILL.md`, `design-dialogue/SKILL.md`
- `execution/SKILL.md`, `implementation-planning/SKILL.md`
- `session-management/SKILL.md`, `validation/SKILL.md`

Infrastructure skills have `user-invocable: false` — they surface in Claude's skill picker but delegate to MCP for content.

## Hooks

4 hook entries across 3 event types (2 with matchers):

| Event | Matcher | Script | Timeout |
|-------|---------|--------|---------|
| `SessionStart` | — | `claude/scripts/hook-runner.js claude session-start` | 10s |
| `PreToolUse` | `Agent` | `claude/scripts/hook-runner.js claude before-agent` | 10s |
| `PreToolUse` | `Bash` | `claude/scripts/policy-enforcer.js` | 5s |
| `SessionEnd` | — | `claude/scripts/hook-runner.js claude session-end` | 10s |

### Key Differences from Gemini

- Uses `PreToolUse` with matchers instead of `BeforeAgent`/`AfterAgent`
- **No AfterAgent hook** — Claude does not validate handoff report format via hooks
- Same effective timeouts (10s) but Claude config uses seconds, Gemini uses milliseconds (10000ms)
- Policy enforcement via hook script, not TOML

### Hook Adapter

`claude/scripts/adapters/claude-adapter.js` normalizes Claude Code stdin:

| Claude Field | Internal Field |
|-------------|----------------|
| `session_id` | `sessionId` |
| `cwd` | `cwd` |
| `hook_event_name` | `event` |
| `tool_input.subagent_type` | `agentName` |
| `tool_input.prompt` | `agentInput` |
| `tool_result` | `agentResult` |
| (hardcoded false) | `stopHookActive` |

Output format: `{ continue: boolean, decision: "approve"|"block", systemMessage?: string, reason?: string }`

## Policy Enforcement

`claude/scripts/policy-enforcer.js` — JavaScript-based, triggered on Bash tool use:

**Deny rules** (blocks command):
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<`)

**Ask rules** (requires user confirmation):
- `tee` commands
- Output redirection (`>`, `>>`)

Parses compound commands (`;`, `&&`, `||`, `|`) and recursively checks subshells (`$(...)`, backticks).

## Tool Mapping

| Canonical | Claude |
|-----------|--------|
| `read_file` / `read_many_files` | `Read` |
| `write_file` | `Write` |
| `replace` | `Edit` |
| `list_directory` / `glob` | `Glob` |
| `grep_search` | `Grep` |
| `google_web_search` | `WebSearch` |
| `web_fetch` | `WebFetch` |
| `run_shell_command` | `Bash` |
| `ask_user` | `AskUserQuestion` |
| `write_todos` | `TaskCreate`, `TaskUpdate`, `TaskList` |
| `activate_skill` | `Skill` |
| `enter_plan_mode` | `EnterPlanMode` |
| `exit_plan_mode` | `ExitPlanMode` |
| `codebase_investigator` | `Agent (Explore)` / `Grep` / `Glob` |

## Feature Flags

The canonical feature set (same flags across all runtimes, values per runtime):

<!-- @feature-flags -->

See `src/platforms/claude/runtime-config.ts` for the authoritative values.

## Agent Frontmatter

Claude agent stubs include example blocks in the description and use camelCase for turns:

```yaml
---
name: coder
description: |
  Implementation specialist...
  
  <example>
  Context: User needs a new feature implemented.
  user: "Implement the login flow"
  assistant: "I'll follow existing patterns..."
  </example>
model: inherit
color: green
maxTurns: 25
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
```

Fields: `model` (always "inherit"), `color`, `maxTurns` (camelCase). No temperature or timeout.

## Generated Files

```
claude/
├── agents/                39 agent stubs (kebab-case)
├── skills/                19 skill directories
├── hooks/                 1 hook config (claude-hooks.json)
├── scripts/               thin hook wrapper, adapter wrapper, policy enforcer
├── mcp/                   thin MCP entrypoint
├── .claude-plugin/        not emitted here; local plugin manifest is assembled into dist/claude-plugin/.claude-plugin/plugin.json by just dev-load-claude
├── .mcp.json
├── mcp-config.example.json
└── README.md
```

These files are generated by `npm run generate` and are untracked in git. For local development, run `just dev-load-claude`, which prints the `claude --plugin-dir …/dist/claude-plugin` command. Marketplace installs resolve plugin content from the CI-published `dist` branch (`{source: github, repo: josstei/maestro-orchestrate, ref: dist}` in `.claude-plugin/marketplace.json`), which already carries the generated `claude/` tree, so no local generate step applies there.

### Dev-Loop and Publish-Window Consequences

Because `claude/.mcp.json` launches the server via `npx -y -p @josstei/maestro@<package version> maestro-mcp-server`, `just dev-load-claude`, a repo-installed plugin, and TUI dogfooding now execute the *published* `@<package version>` package from the npm registry, not local `src/`. Local iteration on unreleased `src/` changes requires a local-path launch override (point the `mcpServers.maestro` entry at a local `node dist/src/bin/maestro-mcp-server.js` invocation after `npm run build`) or `npm link` so the resolved package points at the working tree. Separately, between bumping `package.json`'s version and running `npm publish`, the pinned `@<package version>` does not yet exist on the registry and `npx` 404s — publish must always precede advertising (tagging, announcing, or launching a manifest pinned to) the new version.
