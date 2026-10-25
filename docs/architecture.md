# Maestro Architecture

## System Design

Maestro follows a **src-first, generated-runtime** architecture. Shared behavior and shared content are authored exactly once under `src/`. The runtime roots (`antigravity/`, `claude/`, `plugins/maestro/`, and the repo root, which is Qwen Code's extension directory, plus `qwen/` for Qwen's generated `hooks.json`) hold what each host loads: generated manifests, discovery stubs, commands and skills, hook registrations, detached payloads, and entrypoint wrappers that load `src/`. The wrappers are rendered by `src/generator/runtime-entrypoints.js`, preserving their public paths and loading behavior. [CONTRIBUTING.md](../CONTRIBUTING.md#architecture-canonical-source-and-generated-runtimes) lists which files are generated and which are maintained by hand.

```
                             ┌─────────────┐
                             │   src/      │
                             │  (source    │
                             │   of truth) │
                             └──────┬──────┘
                                    │
                             ┌──────┴──────┐
                             │ generate.js │
                             │ + stubs     │
                             │ + metadata  │
                             └──────┬──────┘
        ┌──────────────────┬────────┴─────────┬──────────────────┐
        ▼                  ▼                  ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  Antigravity   │ │     Claude     │ │     Codex      │ │      Qwen      │
│ (antigravity/) │ │   (claude/)    │ │   (plugins/    │ │   (repo root   │
│                │ │                │ │   maestro/)    │ │    + qwen/)    │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
```

## Generator Pipeline

The generator (`scripts/generate.js`) is the build boundary between canonical source and the runtime outputs. In order, it:

1. Loads every runtime config (`src/platforms/<runtime>/runtime-config.js`, discovered by `src/platforms/runtime-config-map.js`)
2. Scans `src/agents/`, `src/skills/shared/`, `src/templates/`, `src/references/`, and `src/hooks/logic/` into `src/generated/agent-registry.json`, `resource-registry.json`, and `hook-registry.json` (`src/generator/registry-scanner.js`)
3. Collects agent and shared-skill stubs directly (`src/generator/stub-outputs.js`): agent stubs into `antigravity/agents/`, `claude/agents/`, and, for Qwen, the repo-root `agents/` (Qwen Code loads an extension's subagents from `<extension>/agents/`); shared-skill discovery stubs into `antigravity/skills/`, `claude/skills/`, and `plugins/maestro/skills/`
4. Expands the entry-point and core-command registries (`src/generator/entry-point-expander.js`) into Antigravity, Claude, and Codex skills and Qwen TOML commands (`commands/maestro/`)
5. Renders the manifests, marketplace files, hook registrations, and shell policy pack from `package.json` and the runtime configs (`src/platforms/metadata.js`, which takes the policy pack from `src/platforms/qwen/policy-pack.js`): `antigravity/plugin.json`, `antigravity/mcp_config.json`, `antigravity/hooks.json`, `.claude-plugin/marketplace.json`, `claude/.claude-plugin/plugin.json`, `claude/hooks/claude-hooks.json`, `claude/.mcp.json`, `.agents/plugins/marketplace.json`, `plugins/maestro/.codex-plugin/plugin.json`, `plugins/maestro/.mcp.json`, `plugins/maestro/.app.json`, `qwen-extension.json`, `qwen/hooks.json`, and `policies/maestro.toml`
6. Renders the nine public MCP, hook-runner, and policy-enforcer entrypoints (`src/generator/runtime-entrypoints.js`), including the executable Codex npm bin
7. Plans the detached payloads `antigravity/src/`, `claude/src/`, and `plugins/maestro/src/` from dependency closures and explicit content roots, including `version.json`, and validates every destination
8. Writes the collected outputs and prunes stale files from owned agent, skill, command, and detached-payload directories

All dependency plans validate before generation writes or prunes files. `--dry-run` and `--diff` write nothing and report payload additions/removals and executable-mode drift. `--clean` deletes agent and shared-skill stubs before regenerating them.

The shared build-time graph in `src/generator/dependency-graph.js` parses imports with Acorn and Acorn Walk. It resolves local JavaScript, JSON, and directory indexes without executing modules, checks physical containment, and explicitly classifies runtime-config discovery, hook adapters, and registry-listed hook implementations. Unsupported computed or aliased loading and stale annotations fail the check. Parser packages are development dependencies only.

Detached roots include the MCP server, selected runtime config, all five state scripts, registries, served resources, agent bodies, and the handoff contract. Antigravity and Claude additionally retain their hook and policy roots. Codex retains its local MCP fallback but omits hook/policy-only modules. Payload files preserve canonical paths and bytes; there is no bundling or export pruning.

### Discovery Stubs

`src/generator/stub-outputs.js` scans agent Markdown files and shared `SKILL.md` files and invokes their renderers directly. Agent filenames use each runtime's naming convention; shared-skill paths flatten `skills/shared/` to `skills/`. Both use the runtime's `outputDir`.

| Renderer | Purpose |
|----------|---------|
| `src/transforms/agent-stub.js` | Emit ordered runtime frontmatter and mapped tools, folding example blocks into descriptions when enabled, followed by a pointer to `get_agent()` |
| `src/transforms/skill-discovery-stub.js` | Point to `get_skill_content()` with the host's discovery metadata |

### Runtime Definitions

Each runtime (`src/platforms/*/runtime-config.js`) declares:

| Field | Antigravity | Claude | Codex | Qwen |
|-------|-------------|--------|-------|------|
| `outputDir` | `antigravity/` | `claude/` | `plugins/maestro/` | `./` (repo root) |
| `agentNaming` | `kebab-case` | `kebab-case` | `kebab-case` | `snake_case` |
| `agentPrefix` | — | `maestro:` | — | — |
| `mcpPrefix` | `mcp_maestro_maestro_` | `mcp__plugin_maestro_maestro__` | `mcp__maestro_maestro__` | `''` (empty) |
| `mcpClientNames` | `antigravity-client` | `claude-code` | `codex-mcp-client` | `qwen-cli-mcp-client-*` |
| `mcpToolMeta` | `{ "antigravity/alwaysLoad": true }` | — | — | — |
| `planModeNative` | `false` | `true` | `false` | `false` |
| `delegation.pattern` | `invoke_subagent(Subagents: [{ TypeName: "{{agent}}", Role: "...", Prompt: "..." }])` | `Agent(subagent_type: "maestro:{{agent}}", prompt: "...")` | `spawn_agent(...)` | `{{agent}}(query: "...")` |
| `delegation.constraints.result_surface` | `notified` | `synchronous` | `deferred` | `synchronous` |
| `env.extensionPath` | `PLUGIN_ROOT` | `CLAUDE_PLUGIN_ROOT` | `.` (relative) | `extensionPath` |
| `env.workspacePath` | `MAESTRO_WORKSPACE_PATH` | `CLAUDE_PROJECT_DIR` | `MAESTRO_WORKSPACE_PATH` | `workspacePath` |
| `agentFrontmatter.fields` | name, description, subagent, mainAgent, model, tools | name, description, model, color, turns, tools | — (no agent stubs) | name, kind, description, turns, tools |

### Entry-Point Registry

9 entry-points defined in `src/entry-points/registry.js`, each with workflow steps, constraints, agent assignments, and skill references. Generated into:

- Antigravity: Markdown skills in `antigravity/skills/*/`, invoked as `/maestro:<skill>`
- Claude: Markdown skills in `claude/skills/`
- Codex: Markdown skills in `plugins/maestro/skills/*/`, invoked as `$maestro:<skill>`
- Qwen: TOML commands in repo-root `commands/maestro/` (the repo root is Qwen Code's extension directory)

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
├── contracts/                  # Plan schema + complexity tiers, document input and handoff contracts
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
└── validation/                 # validate_plan checkers (schema, DAG, file overlap, agents)
```

The runtime config registry the server and the generator share, `src/platforms/runtime-config-map.js`, sits with the platform configs it discovers, outside `src/mcp/`.

### Content Serving and Path Resolution

The content tools (`get_agent`, `get_skill_content`) are filesystem-only in every runtime: `src/mcp/content/runtime-content.js` reads the requested agent or resource from the resolved canonical `src/` directory and applies the runtime's transforms, with no registry fallback.

This makes the source-of-truth rules explicit:

- shared logic lives under `src/lib`, `src/config`, `src/core`, `src/state`, `src/hooks/logic`, and `src/mcp`
- `just check-layers` (`scripts/check-layer-boundaries.js`) uses the shared dependency graph to enforce the lower-layer dependencies listed below, reject production cycles and dependencies on build-only modules or external packages, and report apparent orphans for review; `npm test` runs the same check
- root `src/` is the only human-authored source of truth
- generator-owned runtime-local mirrors are allowed when a bundled runtime needs self-containment
- no hand-maintained runtime forks are allowed

All guarded layers may import `node:` builtins. Their allowed source dependencies are:

| Layer | Allowed source dependencies |
|-------|-----------------------------|
| `lib` | `lib` |
| `core` | `lib`, `core`, `generated` |
| `config` | `lib`, `core`, `config` |
| `state` | `lib`, `core`, `config`, `state` |
| `hooks` | `lib`, `core`, `config`, `state`, `hooks` |

`src/state/design-gate.js` owns gate persistence and session-creation preconditions; `src/state/session-documents.js` owns document materialization and archival. MCP handlers depend on those stores directly, without importing persistence operations from another handler. Phase field descriptors in `src/mcp/contracts/plan-schema.js` supply the advertised schema, required fields, and runtime validation in one declaration order.

### State Coordination and Recovery

`src/state/paths.js` resolves the configured state directory independently of coordination. `coordinator.js` serializes logical mutations for its physical path and supplies an explicit transaction context to session, gate, and document stores. Nested helpers stage effects in that context rather than acquiring another lock. MCP reads, managed state scripts, workspace initialization, and before-agent session reads use the same protocol; ephemeral hook tracking remains separate.

Private metadata lives beneath `<state_dir>/state/.maestro/`. Ownership is acquired by renaming a complete candidate directory into place, with a random token, PID, hostname, and protocol version. Contention polls asynchronously every 50 ms for up to five seconds; the before-agent reader has a 250 ms budget. Only a definitively absent same-host PID can be reclaimed. Release removes the observed token file and then the empty directory, never recursively deleting the shared lock.

Mutations validate and stage bytes before publishing a durable current-transaction pointer. That publication commits the operation. A versioned journal records ordered effects, before/after fingerprints, captured content, the result, and progress. Recovery accepts the expected prior state or an already-applied result and finishes committed operations. Unexpected edits stop replay and preserve the journal. Archive effects retain their order: completed session contents, session move, document moves, gate removal.

Readers compare revision and transaction markers around their snapshots and retry if a commit overlaps. Ordinary reads neither create directories nor require write access; a pending committed operation must acquire ownership and recover first. A mutation that recovers earlier work returns `STATE_RECOVERED` without starting another mutation. Other explicit errors are `STATE_BUSY`, `STATE_RECOVERY_REQUIRED`, and `STATE_CONFLICT`; their hints tell callers how to inspect or retry safely.

Session formats require no migration. Files and directory metadata are flushed where supported; process-crash recovery is guaranteed, while power-loss durability depends on the operating system and filesystem. Direct editor writes and older processes do not participate in this protocol. Do not downgrade while a committed journal remains. See [state usage](usage.md#concurrent-updates-and-recovery) for the optional digest-guarded CLI form.

### MCP Server Packaging

Qwen uses the repo-root public entrypoint at `mcp/maestro-server.js`, Antigravity and Claude keep runtime-local public entrypoints at `antigravity/mcp/maestro-server.js` and `claude/mcp/maestro-server.js`, and Codex invokes the server via `npx` against a published bin. All are thin wrappers around `src/mcp/maestro-server.js` that only locate `src/`; none names a runtime:

- **Qwen** (`mcp/maestro-server.js`): launched from `qwen-extension.json`, directly requires `../src/mcp/maestro-server` and calls `.main()`
- **Antigravity** (`antigravity/mcp/maestro-server.js`): launched as `node ${PLUGIN_ROOT}/mcp/maestro-server.js` from `antigravity/mcp_config.json`, uses `fs.existsSync()` to prefer repo `../../src/mcp/maestro-server.js` with fallback to bundled `../src/mcp/maestro-server.js`
- **Claude** (`claude/mcp/maestro-server.js`): uses `fs.existsSync()` to prefer repo `../../src/mcp/maestro-server.js` with fallback to bundled `../src/mcp/maestro-server.js`
- **Codex** (`bin/maestro-mcp-server.js` invoked via `npx -y -p @josstei/maestro@<version> maestro-mcp-server` per `plugins/maestro/.mcp.json`): sets `MAESTRO_EXTENSION_PATH`, then requires `../src/mcp/maestro-server` and calls `.main()`

The server identifies its host runtime instead of assuming one. It takes `MAESTRO_RUNTIME` when that variable is set (an unknown value stops the server at startup); otherwise it takes the runtime whose config lists, in `mcpClientNames`, the `clientInfo.name` the MCP client sends in `initialize` (an entry ending in `*` matches any name with that prefix, since Qwen Code appends the server's key). There is no default runtime: when neither identifies one, the server still lists its tools, logs the reason, and fails every tool call with `RUNTIME_UNIDENTIFIED` and a recovery hint naming the valid `MAESTRO_RUNTIME` values. `findRuntimeConfigForClient()` in `src/platforms/runtime-config-map.js` does the lookup, and each client name may belong to one runtime only.

There is no tracked generated MCP core artifact, no tracked runtime-local `lib/` tree, and no bundled content registry. Public entrypoint stability is preserved without introducing a second hand-maintained source of truth.

When a runtime config sets `mcpToolMeta`, `src/mcp/core/create-server.js` lists it as every tool schema's `_meta`. Antigravity's `antigravity/alwaysLoad` marks the tools to register as native tools (`mcp_maestro_maestro_<tool>`) instead of loading them on demand.

### Workspace Resolution

The MCP server does not guess the workspace. Its project root is `null` until the orchestrator calls `initialize_workspace(workspace_path)`, which rejects a nonexistent path and any path inside an extension cache, then records the path's git toplevel (or the path itself outside a git repository). An absent `workspace_path` is rejected until a workspace has been initialized; after that, the call re-initializes the current root. Until then, every tool that needs a workspace fails with `WORKSPACE_NOT_INITIALIZED`.

To help the orchestrator choose that path, `get_runtime_context` returns a `workspace_suggestion` taken from, in order:

1. the environment variable named by the runtime config's `env.workspacePath` (see [Runtime Definitions](#runtime-definitions))
2. the first existing `file://` root in the MCP client's `roots/list` response
3. the server's `cwd`

When the client supports roots, the server requests them after `notifications/initialized` and again on every `notifications/roots/list_changed` (Antigravity sends these repeatedly, sometimes right after answering `roots/list`). Candidates inside an extension cache (`.codex/plugins`, `.claude/plugins`, and Antigravity's `~/.gemini/config/plugins` and `~/.gemini/antigravity-cli/plugins`; `src/core/cache-path-rejector.js`) are skipped at every step, and no other tool falls back to the suggestion (`src/mcp/core/project-root-cache.js`).

### Tool Catalog

The 17 tools (4 workspace, 10 session, 3 content) and their required parameters are listed once, in the [MCP Tools Quick Reference](usage.md#mcp-tools-quick-reference).

## Agent System

### Agent Definitions

Each agent in `src/agents/` has:

- **YAML frontmatter**: `name`, `description`, `color`, `tools`, `max_turns`. `tools` is the one canonical tool list, written in canonical tool names that each runtime maps through its runtime config's `tools` table; runtime agent-tool defaults preserve host ordering and exclusions, and an optional `tools.<runtime>` key replaces those defaults for intentional exceptions
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
| Antigravity | `antigravity/hooks.json` | `SessionStart` (session-start and before-agent handlers; fires for the main conversation and each subagent conversation); timeouts in seconds (10) | `node hooks/hook-runner.js antigravity <hook>`, run from the plugin root |
| Antigravity | `antigravity/hooks.json` | `PreToolUse` (`run_command` matcher); 5-second timeout | `node hooks/policy-enforcer.js`, run from the plugin root |
| Claude Code | `claude/hooks/claude-hooks.json` | `SessionStart`, `PreToolUse` (`Agent` matcher), `SessionEnd`; timeouts in seconds (10) | `node ${CLAUDE_PLUGIN_ROOT}/scripts/hook-runner.js claude <hook>` |
| Claude Code | `claude/hooks/claude-hooks.json` | `PreToolUse` (`Bash` matcher); 5-second timeout | `node ${CLAUDE_PLUGIN_ROOT}/scripts/policy-enforcer.js` |
| Qwen Code | `qwen/hooks.json` | `SessionStart`, `SubagentStart`, `SubagentStop`, `SessionEnd`; timeouts in milliseconds (10000) | `node ${extensionPath}/hooks/hook-runner.js qwen <hook>` |
| Codex | — | none | — |

`src/platforms/metadata.js` generates all three registration files. Every hook runner loads `src/platforms/shared/hook-runner.js`: Qwen's repo-root `hooks/hook-runner.js` directly, and `antigravity/hooks/hook-runner.js` and `claude/scripts/hook-runner.js` from the repo `src/` when present, otherwise from the bundled `antigravity/src/` or `claude/src/`. The shared runner looks `<hook>` up in `src/generated/hook-registry.json`, normalizes stdin through `src/platforms/<runtime>/hook-adapter.js`, runs the matching `src/hooks/logic/<hook>-logic.js` handler, and formats the result for the host. Antigravity has no session-end or post-delegation event, so the orchestrator validates handoff reports itself there. Per-event behavior and the adapter field mappings are in [runtime-antigravity.md](runtime-antigravity.md#hooks), [runtime-claude.md](runtime-claude.md#hooks), and [runtime-qwen.md](runtime-qwen.md#hooks).

### Policy Enforcement

Antigravity, Claude, and Qwen apply the same rules from `src/core/policy-rules.js`: they block destructive commands (`rm -rf`, `git reset --hard`, `git checkout --`, `git clean -fd` and its variants, heredocs) and require confirmation for `tee` and output redirects (`>`, `>>`):

- **Antigravity**: `src/platforms/antigravity/policy-enforcer.js`, run on `run_command` through the `antigravity/hooks/policy-enforcer.js` shim (repo `src/` first, bundled `antigravity/src/` fallback). It answers `deny` for a deny rule, `force_ask` for an ask rule, and `ask` for any other command, which leaves the user's own permission settings in charge; it answers `deny` when the check cannot run
- **Claude**: `src/platforms/claude/policy-enforcer.js`, run on Bash tool use through the `claude/scripts/policy-enforcer.js` shim (repo `src/` first, bundled `claude/src/` fallback)
- **Qwen**: the TOML policy pack `policies/maestro.toml`, rendered from those rules by `src/platforms/qwen/policy-pack.js` for the Qwen builder in `src/platforms/metadata.js`

Both JavaScript enforcers run `checkCommand()` from `src/core/policy-rules.js`, which splits compound commands and checks `$(...)` and backtick subshells, through the shared runner `src/platforms/shared/policy-enforcer.js`, which reads stdin with the bounded collector in `src/core/stdin-reader.js` and formats every decision; they differ only in where they read the command and what they name each decision.

### Hook State

Ephemeral state is stored in `os.tmpdir()/maestro-hooks-<uid>/` (override with `MAESTRO_HOOKS_DIR`):
- Tracks active agent per session
- Stale directories pruned after 2 hours
- Restricted permissions (0o700)
- Atomic writes via temp file + rename

## Settings Resolution

Settings resolve with precedence: environment variable → workspace `.env` → extension `.env` → default. Each setting, its default, and its allowed values are listed in [docs/usage.md](usage.md#settings); `src/config/settings-catalog.js` is the canonical list.

Each `resolve_settings` request creates a lazy resolver that reads each reached `.env` path once, including missing or unreadable files. Logical consultations replay parser warnings in their original order and multiplicity. Environment variables remain live, scalar `resolveSetting` calls remain fresh, and parsed files are snapshots only for the current request. Agent and resource reads likewise remain fresh between requests.

## CI and Testing

For detailed documentation of all seven GitHub Actions workflows, the release pipeline chain, and Mermaid flow diagrams, see [docs/cicd.md](cicd.md).

### Test Suite

Tests use the Node.js built-in `node:test` runner and live in `tests/unit/`, `tests/transforms/`, and `tests/integration/`, with shared fixtures and helpers under `tests/support/`.

`npm test` (and `just test`) run the globs `tests/unit/*.test.js`, `tests/transforms/*.test.js`, and `tests/integration/*.test.js`, so every test file in those directories is picked up automatically.

### Zero-Drift Guarantee

CI validates that generated output matches committed state:

1. Run `node scripts/generate.js --check`, which writes nothing
2. Fail if any generated file would be created, updated, or removed
