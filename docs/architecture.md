# Maestro Architecture

## System Design

Maestro follows a **src-first, generated-runtime** architecture. Shared behavior and shared content are authored exactly once under `src/`. The runtime roots (`./`, `claude/`, `plugins/maestro/`, and `qwen/`, plus the repo-root Qwen manifest and context file) hold what each host loads: generated manifests, discovery stubs, commands and skills, hook registrations, and detached payloads, plus a few hand-maintained shims (the MCP server, hook-runner and Claude policy-enforcer entrypoints) that load `src/`. [CONTRIBUTING.md](../CONTRIBUTING.md#architecture-canonical-source-and-generated-runtimes) lists which files are generated and which are maintained by hand.

```
                    ┌─────────────┐
                    │   src/      │
                    │  (source    │
                    │   of truth) │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ generate.js │
                    │ + manifest  │
                    │ + transforms│
                    └──────┬──────┘
           ┌───────────────┼───────────────┬───────────────┐
           ▼               ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Gemini    │ │   Claude    │ │    Codex    │ │    Qwen     │
    │   (root)    │ │  (claude/)  │ │(plugins/    │ │   (qwen/)   │
    │             │ │             │ │  maestro/)  │ │             │
    └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## Generator Pipeline

The generator (`scripts/generate.js`) is the build boundary between canonical source and the runtime outputs. In order, it:

1. Loads every runtime config (`src/platforms/<runtime>/runtime-config.js`, discovered by `src/mcp/runtime/runtime-config-map.js`)
2. Scans `src/agents/`, `src/skills/shared/`, `src/templates/`, `src/references/`, and `src/hooks/logic/` into `src/generated/agent-registry.json`, `resource-registry.json`, and `hook-registry.json` (`src/generator/registry-scanner.js`)
3. Expands the rules in `src/manifest.js` and runs their transforms: agent stubs into `agents/`, `claude/agents/`, and `qwen/agents/`; shared-skill discovery stubs into `claude/skills/` and `plugins/maestro/skills/`
4. Expands the entry-point and core-command registries into Gemini TOML commands (`commands/maestro/`) and Claude and Codex skills (`src/generator/entry-point-expander.js`)
5. Writes the manifests, marketplace files, hook registrations, and shell policy pack from `package.json` and the runtime configs (`src/platforms/metadata.js`): `gemini-extension.json`, `hooks/hooks.json`, `policies/maestro.toml`, `qwen-extension.json`, `qwen/hooks.json`, `.claude-plugin/marketplace.json`, `claude/.claude-plugin/plugin.json`, `claude/hooks/claude-hooks.json`, `claude/.mcp.json`, `.agents/plugins/marketplace.json`, `plugins/maestro/.codex-plugin/plugin.json`, `plugins/maestro/.mcp.json`, and `plugins/maestro/.app.json`
6. Prunes stale files from the directories it owns (`agents/`, `claude/agents/`, `qwen/agents/`, `claude/skills/`, `plugins/maestro/skills/`, and `commands/`)
7. Rebuilds the detached payloads `claude/src/` and `plugins/maestro/src/` (an allowlisted copy of `src/` plus that runtime's `src/platforms/<runtime>/` directory) and stamps each with `version.json`

`--dry-run` and `--diff` write nothing and skip steps 6 and 7. `--clean` deletes the manifest outputs before regenerating them.

### Manifest System

`src/manifest.js` declares how source files map to outputs. Each entry specifies:

```javascript
{
  src: 'agents/architect.md',           // Source file
  transforms: ['agent-stub'],           // Transform pipeline
  runtimes: ['gemini', 'claude', 'qwen'],       // Target runtimes
}
```

Or with glob patterns:

```javascript
{
  glob: 'agents/*.md',
  transforms: ['agent-stub'],
  runtimes: ['gemini', 'claude', 'qwen'],
}
```

Each output path is the source path under the runtime's `outputDir`, with `skills/shared/` flattened to `skills/` and agent filenames converted to snake_case for snake_case runtimes.

### Transform Pipeline

The generator exposes 2 transforms, registered by name in `src/transforms/index.js`:

| Transform | Purpose |
|-----------|---------|
| `agent-stub` | Emit the runtime's agent frontmatter (the fields its `agentFrontmatter.fields` lists, with tools in that runtime's names and, when `features.exampleBlocks` is on, the body's `<example>` blocks folded into the description), followed by a one-line body that points at `get_agent()` |
| `skill-discovery-stub` | Replace a shared skill body with a stub that points at `get_skill_content()`; Claude stubs also set `user-invocable: false` |

### Runtime Definitions

Each runtime (`src/platforms/*/runtime-config.js`) declares:

| Field | Gemini | Claude | Codex | Qwen |
|-------|--------|--------|-------|------|
| `outputDir` | `./` | `claude/` | `plugins/maestro/` | `qwen/` |
| `agentNaming` | `snake_case` | `kebab-case` | `kebab-case` | `snake_case` |
| `agentPrefix` | — | `maestro:` | — | — |
| `mcpPrefix` | `mcp_maestro_` | `mcp__plugin_maestro_maestro__` | `mcp__maestro_maestro__` | `''` (empty) |
| `planModeNative` | `true` | `true` | `false` | `false` |
| `delegation.pattern` | `{{agent}}(query: "...")` | `Agent(subagent_type: "maestro:{{agent}}", prompt: "...")` | `spawn_agent(...)` | `{{agent}}(query: "...")` |
| `env.extensionPath` | `extensionPath` | `CLAUDE_PLUGIN_ROOT` | `.` (relative) | `extensionPath` |
| `env.workspacePath` | `null` (manifest injects `MAESTRO_WORKSPACE_PATH=${workspacePath}`) | `CLAUDE_PROJECT_DIR` | `MAESTRO_WORKSPACE_PATH` | `workspacePath` |
| `agentFrontmatter.fields` | name, kind, description, tools, temperature, turns, timeout | name, description, model, color, turns, tools | — (no agent stubs) | name, kind, description, turns, tools |

The Qwen config spreads the Gemini config and overrides only what differs.

### Entry-Point Registry

9 entry-points defined in `src/entry-points/registry.js`, each with workflow steps, constraints, agent assignments, and skill references. Generated into:

- Gemini: TOML commands in `commands/maestro/`
- Claude: Markdown skills in `claude/skills/`
- Codex: Markdown skills in `plugins/maestro/skills/*/`, invoked as `$maestro:<skill>`
- Qwen: reuses Gemini's repo-root `commands/maestro/` TOML commands at runtime — `src/generator/entry-point-expander.js` sets `qwen: null` for both entry-point and core-command expansion, so the Qwen generator emits no command files of its own

Entry-points: review, debug, archive, status, security-audit, perf-check, seo-audit, a11y-audit, compliance-check.

Plus 3 core commands (orchestrate, execute, resume) maintained separately in `src/entry-points/core-command-registry.js`.

## MCP Server Architecture

The MCP server is authored directly in modular source under `src/mcp/`. Each runtime reaches it through a thin entrypoint; see [MCP Server Packaging](#mcp-server-packaging).

### Module Structure

```
src/mcp/
├── maestro-server.js           # Server entry-point (main) + default tool pack order
├── content/
│   └── runtime-content.js      # Runtime-specific content resolution
├── contracts/                  # Plan schema, workspace marker and handoff contracts
├── core/
│   ├── create-server.js        # Tool pack composition, dispatch + error sanitization
│   ├── protocol-dispatcher.js  # JSON-RPC routing + tool result framing
│   ├── project-root-cache.js   # Workspace path + workspace_suggestion
│   ├── line-reader.js          # stdin line → JSON message dispatch
│   └── recovery-hints.js       # Error → recovery guidance mapping
├── handlers/                   # 10 handler implementations
│   ├── get-agent.js            # Agent methodology serving
│   ├── get-skill-content.js    # Skill/template/reference serving
│   ├── get-runtime-context.js  # Runtime config snapshot
│   ├── initialize-workspace.js # Directory setup
│   ├── assess-task-complexity.js # Repo analysis signals
│   ├── validate-plan.js        # Plan validation + dependency DAG
│   ├── resolve-settings.js     # Config resolution
│   ├── session-state-tools.js  # Session CRUD (create/get/update/transition/archive)
│   ├── design-gate.js          # Design-gate lifecycle (3 tools)
│   └── reconciliation.js       # Phase reconciliation (2 tools)
├── tool-packs/
│   ├── workspace/index.js      # 4 tools
│   ├── session/index.js        # 10 tools
│   └── content/index.js        # 3 tools
├── utils/
│   └── extension-root.js       # Canonical src/ resolution
├── validation/                 # validate_plan checkers (schema, DAG, file overlap, agents)
└── runtime/
    └── runtime-config-map.js   # Runtime config registry
```

### Content Serving and Path Resolution

The content tools (`get_agent`, `get_skill_content`) are filesystem-only in every runtime: `src/mcp/content/runtime-content.js` reads the requested agent or resource from the resolved canonical `src/` directory and applies the runtime's transforms, with no registry fallback.

This makes the source-of-truth rules explicit:

- shared logic lives under `src/lib`, `src/config`, `src/core`, `src/state`, `src/hooks/logic`, and `src/mcp`
- `src/lib` may import only other `src/lib` modules and `node:` builtins; `just check-layers` (`scripts/check-layer-boundaries.js`) enforces this, and `npm test` runs the same check
- root `src/` is the only human-authored source of truth
- generator-owned runtime-local mirrors are allowed when a bundled runtime needs self-containment
- no hand-maintained runtime forks are allowed

### MCP Server Packaging

Gemini and Qwen share the repo-root public entrypoint at `mcp/maestro-server.js`, Claude keeps a runtime-local public entrypoint at `claude/mcp/maestro-server.js`, and Codex invokes the server via `npx` against a published bin. All are thin wrappers around `src/mcp/maestro-server.js`:

- **Gemini** (`mcp/maestro-server.js`): launched with `MAESTRO_RUNTIME=gemini`, directly requires `../src/mcp/maestro-server` and calls `.main()`
- **Qwen** (`mcp/maestro-server.js`): launched with `MAESTRO_RUNTIME=qwen` from `qwen-extension.json`, using the same shared entrypoint as Gemini
- **Claude** (`claude/mcp/maestro-server.js`): sets `MAESTRO_RUNTIME=claude`, uses `fs.existsSync()` to prefer repo `../../src/mcp/maestro-server.js` with fallback to bundled `../src/mcp/maestro-server.js`
- **Codex** (`bin/maestro-mcp-server.js` invoked via `npx -y -p @josstei/maestro@<version> maestro-mcp-server` per `plugins/maestro/.mcp.json`): sets `MAESTRO_RUNTIME=codex` and `MAESTRO_EXTENSION_PATH`, then requires `../src/mcp/maestro-server` and calls `.main()`

There is no tracked generated MCP core artifact, no tracked runtime-local `lib/` tree, and no bundled content registry. Public entrypoint stability is preserved without introducing a second hand-maintained source of truth.

### Workspace Resolution

The MCP server does not guess the workspace. Its project root is `null` until the orchestrator calls `initialize_workspace(workspace_path)`, which rejects a nonexistent path and any path inside an extension cache, then records the path's git toplevel (or the path itself outside a git repository). An absent `workspace_path` is rejected until a workspace has been initialized; after that, the call re-initializes the current root. Until then, every tool that needs a workspace fails with `WORKSPACE_NOT_INITIALIZED`.

To help the orchestrator choose that path, `get_runtime_context` returns a `workspace_suggestion` taken from, in order:

1. the environment variable named by the runtime config's `env.workspacePath` (see [Runtime Definitions](#runtime-definitions); Gemini declares `null`, so its suggestion starts at step 2)
2. the first existing `file://` root in the MCP client's `roots/list` response
3. the server's `cwd`

Candidates inside an extension cache are skipped at every step, and no other tool falls back to the suggestion (`src/mcp/core/project-root-cache.js`).

### Tool Catalog

The 17 tools (4 workspace, 10 session, 3 content) and their required parameters are listed once, in the [MCP Tools Quick Reference](usage.md#mcp-tools-quick-reference).

## Agent System

### Agent Definitions

Each agent in `src/agents/` has:

- **YAML frontmatter**: `name`, `description`, `color`, `tools`, `max_turns`, `temperature`, `timeout_mins`. `tools` is the one canonical tool list, written in Gemini CLI tool names; an optional `tools.<runtime>` key (every agent sets `tools.claude`) replaces it for that runtime
- **Methodology body**: role description, assessment areas, decision frameworks, anti-patterns
- **Downstream consumer contracts**: what other agents need from this agent's output

The tool tier recorded in `src/generated/agent-registry.json` is derived from `tools`: `write_file` or `replace` grants write access, `run_shell_command` grants shell access, both make the agent `full`, and neither makes it `read_only`. Agent frontmatter has no `capabilities` field.

All agents share one Output Contract (the Handoff Report format). It lives once in `src/agents/shared/handoff-report.md`, and `get_agent` appends it to every agent body it serves.

### Stub Generation

The `agent-stub` transform writes a thin stub for each runtime: the frontmatter fields that runtime's `agentFrontmatter.fields` lists, then a single body line. Full methodology is served via MCP at delegation time:

```markdown
Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["architect"])` to read the full methodology at delegation time.
```

### Delegation Protocol

When delegating to an agent, the orchestrator:

1. Loads `agent-base-protocol` and `filesystem-safety-protocol` via MCP
2. Calls `get_agent` to load the agent's full methodology and tool restrictions
3. Constructs a delegation prompt with: task, progress context, file lists, validation commands, downstream consumer info
4. Dispatches via the runtime's native delegation mechanism
5. Parses the handoff report (Task Report + Downstream Context)
6. Transitions the phase via `transition_phase` MCP tool

## Hook System

Hooks fire at session and agent boundaries to inject context and validate output.

| Runtime | Registration file | Events | Command |
|---------|-------------------|--------|---------|
| Gemini CLI | `hooks/hooks.json` | `SessionStart`, `BeforeAgent`, `AfterAgent`, `SessionEnd`; no matchers; timeouts in milliseconds (10000) | `node ${extensionPath}/hooks/hook-runner.js gemini <hook>` |
| Claude Code | `claude/hooks/claude-hooks.json` | `SessionStart`, `PreToolUse` (`Agent` matcher), `SessionEnd`; timeouts in seconds (10) | `node ${CLAUDE_PLUGIN_ROOT}/scripts/hook-runner.js claude <hook>` |
| Claude Code | `claude/hooks/claude-hooks.json` | `PreToolUse` (`Bash` matcher); 5-second timeout | `node ${CLAUDE_PLUGIN_ROOT}/scripts/policy-enforcer.js` |
| Qwen Code | `qwen/hooks.json` | `SessionStart`, `SubagentStart`, `SubagentStop`, `SessionEnd`; timeouts in milliseconds (10000) | `node ${extensionPath}/hooks/hook-runner.js qwen <hook>` |
| Codex | — | none | — |

`src/platforms/metadata.js` generates all three registration files. Both hook runners load `src/platforms/shared/hook-runner.js`: `hooks/hook-runner.js` directly, and `claude/scripts/hook-runner.js` from the repo `src/` when present, otherwise from the bundled `claude/src/`. The shared runner looks `<hook>` up in `src/generated/hook-registry.json`, normalizes stdin through `src/platforms/<runtime>/hook-adapter.js`, runs the matching `src/hooks/logic/<hook>-logic.js` handler, and formats the result for the host. Per-event behavior and the adapter field mappings are in [runtime-gemini.md](runtime-gemini.md#hooks), [runtime-claude.md](runtime-claude.md#hooks), and [runtime-qwen.md](runtime-qwen.md#hooks).

### Policy Enforcement

Gemini, Qwen, and Claude apply the same rules from `src/core/policy-rules.js`: they block destructive commands (`rm -rf`, `git reset --hard`, `git checkout --`, `git clean -fd` and its variants, heredocs) and require confirmation for `tee` and output redirects (`>`, `>>`):

- **Gemini** and **Qwen**: the TOML policy pack `policies/maestro.toml`, generated from those rules by `src/platforms/metadata.js`
- **Claude**: `src/platforms/claude/policy-enforcer.js`, run on Bash tool use through the `claude/scripts/policy-enforcer.js` shim (repo `src/` first, bundled `claude/src/` fallback)

### Hook State

Ephemeral state is stored in `os.tmpdir()/maestro-hooks-<uid>/` (override with `MAESTRO_HOOKS_DIR`):
- Tracks active agent per session
- Stale directories pruned after 2 hours
- Restricted permissions (0o700)
- Atomic writes via temp file + rename

## Settings Resolution

Settings resolve with precedence: environment variable → workspace `.env` → extension `.env` → default. Each setting, its default, and its allowed values are listed in [docs/usage.md](usage.md#settings); `src/config/settings-catalog.js` is the canonical list.

## CI and Testing

For detailed documentation of all seven GitHub Actions workflows, the release pipeline chain, and Mermaid flow diagrams, see [docs/cicd.md](cicd.md).

### Test Suite

Tests use the Node.js built-in `node:test` runner and live in `tests/unit/`, `tests/transforms/`, and `tests/integration/`, with shared fixtures and helpers under `tests/support/`.

`npm test` (and `just test`) run the globs `tests/unit/*.test.js`, `tests/transforms/*.test.js`, and `tests/integration/*.test.js`, so every test file in those directories is picked up automatically.

### Zero-Drift Guarantee

CI validates that generated output matches committed state:

1. Run `node scripts/generate.js`
2. Check `git diff --exit-code --name-only`
3. Fail if any generated file differs from source
