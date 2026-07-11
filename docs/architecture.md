# Maestro Architecture

## System Design

Maestro follows a **src-first, generated-runtime** architecture. Shared behavior and shared content are authored exactly once under `src/`. Runtime roots (`./`, `claude/`, `plugins/maestro/`, and `qwen/`, plus the repo-root Qwen manifest/context files) contain host-facing manifests, entrypoints, discovery stubs, and public adapter files; they do not carry mirrored source payloads. Runtime execution and public package bins use compiled NodeNext ESM output under `dist/src/`.

```
                    ┌─────────────┐
                    │   src/      │
                    │  (source    │
                    │   of truth) │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ npm run     │
                    │ generate    │
                    │ (dist/src/  │
                    │ tooling)    │
                    │  + manifest │
                    │  + transforms│
                    └──────┬──────┘
       ┌───────────┬───────────┬───────────┬───────────┐
       ▼           ▼           ▼           ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Gemini    │ │   Claude    │ │    Codex    │ │    Qwen     │
    │   (root)    │ │  (claude/)  │ │(plugins/    │ │   (qwen/)   │
    │             │ │             │ │  maestro/)  │ │             │
    └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## Generator Pipeline

The generator (`src/tooling/generate.ts`, emitted to `dist/src/tooling/generate.js`) is the build boundary between canonical source and runtime adapters. `npm run generate` runs `npm run build` first, then invokes the compiled generator. It:

1. Loads runtime configs from the compiled `dist/src/platforms/*/runtime-config.js`
2. Expands manifest rules from `src/manifest.ts` into concrete runtime outputs
3. Copies or transforms the public runtime adapter assets
4. Expands the entry-point registry into runtime-specific command or skill surfaces
5. Prunes stale generated adapter files from owned directories

### Manifest System

`src/manifest.ts` declares how source files map to outputs. Each entry specifies:

```javascript
{
  src: 'agents/architect.md',           // Source file
  transforms: ['parse-frontmatter', 'extract-examples', 'rebuild-frontmatter', 'agent-stub'],  // Transform pipeline
  runtimes: ['gemini', 'claude', 'qwen'],       // Target runtimes
}
```

Or with glob patterns:

```javascript
{
  glob: 'agents/*.md',
  transforms: ['parse-frontmatter', 'extract-examples', 'rebuild-frontmatter', 'agent-stub'],
  runtimes: ['gemini', 'claude', 'qwen'],
}
```

### Transform Pipeline

The generator exposes 6 transforms (in `src/transforms/`, excluding the `index.js` barrel). Current manifest entries use a subset depending on the target surface.

| Transform | Purpose |
|-----------|---------|
| `parse-frontmatter` | Parse YAML frontmatter from source and stash it in pipeline state |
| `extract-examples` | Extract `<example>` blocks from agent bodies (Claude only) |
| `rebuild-frontmatter` | Emit runtime-specific YAML frontmatter (tools, fields, kind) |
| `agent-stub` | Replace agent body with MCP delegation stub referencing `get_agent()` |
| `skill-discovery-stub` | Replace shared skill body with MCP tool stub referencing `get_skill_content()` |
| `skill-metadata` | Inject `user-invocable: false` into Claude skill frontmatter |

### Runtime Definitions

Each runtime is authored as `src/platforms/*/runtime-config.ts` and loaded after build from `dist/src/platforms/*/runtime-config.js`. It declares:

| Field | Gemini | Claude | Codex | Qwen |
|-------|--------|--------|-------|------|
| `outputDir` | `./` | `claude/` | `plugins/maestro/` | `qwen/` |
| `agentNaming` | `snake_case` | `kebab-case` | `kebab-case` | `snake_case` |
| `delegation.pattern` | `{{agent}}(query: "...")` | `Agent(subagent_type: "maestro:{{agent}}", prompt: "...")` | `spawn_agent(...)` | `{{agent}}(query: "...")` |
| `env.extensionPath` | `extensionPath` | `CLAUDE_PLUGIN_ROOT` | `.` (relative) | `extensionPath` |
| `env.workspacePath` | `null` (manifest injects `MAESTRO_WORKSPACE_PATH=${workspacePath}`) | `CLAUDE_PROJECT_DIR` | `MAESTRO_WORKSPACE_PATH` | `workspacePath` |

### Entry-Point Registry

10 entry-points defined in `src/entry-points/registry.ts`, each with workflow steps, constraints, agent assignments, and skill references. Generated into:

- Gemini: TOML commands in `commands/maestro/`
- Claude: Markdown skills in `claude/skills/`
- Codex: Markdown skills in `plugins/maestro/skills/*/`, invoked as `$maestro:<skill>`
- Qwen: reuses Gemini's repo-root `commands/maestro/` TOML commands at runtime — `src/platforms/qwen/runtime-config.ts` sets both `generation.entryPoint` and `generation.coreCommand` to `null`, so the Qwen generator emits no command files of its own

Entry-points: review, debug, archive, status, security-audit, perf-check, seo-audit, a11y-audit, compliance-check.

Plus 3 core commands (orchestrate, execute, resume) maintained separately in `src/entry-points/core-command-registry.ts`.

## MCP Server Architecture

The MCP server is authored directly in modular source under `src/mcp/` and executed from compiled output under `dist/src/mcp/`. All four runtimes launch it via `npx -y -p @josstei/maestro@<version> maestro-mcp-server`, resolving to the `maestro-mcp-server` package bin (`dist/src/bin/maestro-mcp-server.js`) declared in `package.json`, which selects the runtime from `MAESTRO_RUNTIME` (each manifest sets it explicitly; the bin defaults to `codex` if absent) and loads `dist/src/mcp/maestro-server.js`. Gemini and Qwen still ship the repo-root wrapper at `mcp/maestro-server.js`, and Claude still ships its own thin wrapper at `claude/mcp/maestro-server.js`, but none of these wrappers are the manifest launch target anymore — they remain direct source-checkout entrypoints and also require compiled `dist/src`.

### Module Structure

```
src/mcp/
├── maestro-server.js           # Server entry-point (runRuntimeServer)
├── content/
│   ├── provider.js             # Content provider abstraction
│   └── runtime-content.js      # Runtime-specific content resolution
├── server/
│   ├── create-mcp-server.js    # SDK McpServer factory + StdioServerTransport connect
│   ├── tool-pipeline.js        # Reduced decorator pipeline bridging handlers to the SDK
│   ├── handler-context.js      # Per-call handler context construction
│   ├── tool-result.js          # Tool-outcome → CallToolResult mapping
│   └── elicitation-schemas.js  # `requestedSchema` payloads for `ctx.elicit`
├── core/
│   ├── project-root-cache.js   # Client-roots resolution + workspace-path caching
│   ├── tool-outcome.js         # Success/error tool-outcome normalization
│   └── recovery-hints.js       # Error → recovery guidance mapping
├── handlers/                   # 27 handler implementations
│   ├── get-agent.js            # Agent methodology serving
│   ├── get-skill-content.js    # Skill/template/reference serving
│   ├── get-runtime-context.js  # Runtime config snapshot
│   ├── initialize-workspace.js # Directory setup
│   ├── assess-task-complexity.js # Repo analysis signals
│   ├── validate-plan.js        # Plan validation + dependency DAG
│   ├── resolve-settings.js     # Config resolution
│   ├── session-state-core.js   # Session-state transaction helpers
│   ├── session-state-tools.js  # Session CRUD (create/get/update/transition/archive)
│   ├── design-gate.js          # Design-gate lifecycle (3 tools)
│   ├── reconciliation.js       # Phase reconciliation (2 tools)
│   ├── archive-index.js        # Archive index/search + cost insights (3 tools)
│   ├── archive-compaction.js   # Deterministic archive retention pruning
│   ├── session-lineage.js      # Session fork + lineage handlers (2 tools)
│   ├── checkpoints.js          # Session checkpoint capture + restore handlers (2 tools)
│   ├── session-blueprints.js   # Declarative session blueprint listing/instantiation (2 tools)
│   ├── blocker-parser.js       # Child-agent blocker surfacing
│   ├── session-migrations.js   # Session-state schema versioning + migration
│   ├── recall.js               # Semantic recall over archived corpus (1 tool)
│   ├── project-profile.js      # Project-memory profile read/update
│   ├── agent-performance.js    # Per-agent outcome ledger + priors
│   ├── plan-accuracy.js        # Plan-vs-actual file accuracy ledger
│   ├── architecture-memory.js  # Cross-session architecture-memory graph
│   ├── memory-pack.js          # Committable project memory import/export
│   ├── agent-memory.js         # Per-agent durable memory notes
│   ├── org-knowledge.js        # Cross-project out-of-tree knowledge notes
│   └── ratings.js              # Human-satisfaction ratings
├── memory/
│   ├── project-profile-store.js # Per-project profile persistence
│   ├── architecture-memory-store.js # Architecture-memory graph persistence
│   ├── agent-performance-store.js # Per-agent outcome ledger
│   ├── agent-memory-store.js   # Per-agent durable memory notes
│   ├── jsonl-ledgers.js        # Ratings and plan-accuracy ledgers
│   └── knowledge-store.js      # Out-of-tree cross-project knowledge store
├── tool-packs/
│   ├── index.js                # Tool pack aggregation
│   ├── contracts.js            # Tool registry/pipeline contracts
│   ├── command-table.js        # Name-keyed schema/handler declarations
│   ├── workspace/index.js      # 4 tools
│   ├── session/index.js        # 12 tools
│   ├── content/index.js        # 3 tools
│   ├── memory/index.js         # 15 tools
│   └── history/index.js        # 6 tools
├── utils/
│   └── extension-root.js       # Path resolution
└── runtime/
    └── runtime-config-map.js   # Runtime config registry
```

### Content Serving and Path Resolution

The content tools (`get_agent`, `get_skill_content`) use the same provider contract for Gemini, Claude, Codex, and Qwen, rooted at package-root `dist/src`. Packaged builds prefer the generated registry index at `dist/src/generated/runtime-content-registry.json` plus gzip-compressed payload at `dist/src/generated/runtime-content-registry.txt.gz`; source checkouts without that registry continue to read canonical content from the filesystem:

- Gemini: `primary=registry`, `source-checkout fallback=filesystem`
- Claude: `primary=registry`, `source-checkout fallback=filesystem`
- Codex: `primary=registry`, `source-checkout fallback=filesystem`
- Qwen: `primary=registry`, `source-checkout fallback=filesystem`

All four runtimes spawn `dist/src/bin/maestro-mcp-server.js` via a release-versioned `npx -y -p @josstei/maestro@<version> maestro-mcp-server` invocation declared in each runtime's manifest (`gemini-extension.json`, `qwen-extension.json`, `claude/.mcp.json`, `plugins/maestro/.mcp.json`). The bin honors an env-provided `MAESTRO_RUNTIME` (defaulting to `codex` if absent) — Gemini's and Qwen's manifests set `MAESTRO_RUNTIME=gemini`/`MAESTRO_RUNTIME=qwen`, Claude's sets `MAESTRO_RUNTIME=claude`, Codex's sets `MAESTRO_RUNTIME=codex` — overwrites `MAESTRO_EXTENSION_PATH` with the package root, then imports `dist/src/mcp/maestro-server.js`. The repo-root `mcp/maestro-server.js` (shared by Gemini/Qwen) and `claude/mcp/maestro-server.js` wrappers still ship but are no longer the launch target.

Provider sources return raw content before runtime materialization. Runtime transforms, frontmatter stripping, feature blocks, agent naming, and tool mapping stay centralized in `src/mcp/content/runtime-content.js`, and the generated registry feeds that same materialization path instead of carrying pre-transformed copies.

MCP tool packs declare tools through homomorphic command tables keyed by each
pack's `zodSchemas` object. Each command owns its description, workspace
requirement, handler-context projection, optional post-call hook, and handler;
`registerCommandTable` then routes every declaration through the shared
`defineTool` pipeline.

This makes one architectural rule explicit:

- shared logic lives under `src/config`, `src/core`, `src/state`, `src/hooks/logic`, and `src/mcp`, then executes from the corresponding `dist/src/**` output
- root `src/` is the only human-authored source of truth
- generator-owned runtime-local mirrors are retired; public runtime roots carry host-facing manifests, stubs, and entrypoints only
- no hand-maintained runtime forks are allowed

### MCP Server Packaging

All four runtimes invoke the server via `npx -y -p @josstei/maestro@<version> maestro-mcp-server`, which resolves to `dist/src/bin/maestro-mcp-server.js`. Gemini and Qwen still ship the repo-root public entrypoint at `mcp/maestro-server.js`, and Claude still ships a runtime-local public entrypoint at `claude/mcp/maestro-server.js`, but neither is the launch target — both remain thin wrappers around compiled `dist/src/mcp/maestro-server.js` for direct source-checkout use outside the manifest launch path:

- **Gemini** (`gemini-extension.json`): `npx` sets `MAESTRO_RUNTIME=gemini`; the bin overwrites `MAESTRO_EXTENSION_PATH` with the package root, imports `dist/src/mcp/maestro-server.js`, and calls `.main()`
- **Qwen** (`qwen-extension.json`): `npx` sets `MAESTRO_RUNTIME=qwen`; same bin path as Gemini
- **Claude** (`claude/.mcp.json`): `npx` sets `MAESTRO_RUNTIME=claude`; same bin path
- **Codex** (`plugins/maestro/.mcp.json`): `npx` sets `MAESTRO_RUNTIME=codex`; same bin path (also the bin's default if `MAESTRO_RUNTIME` is unset entirely)

There is no tracked generated MCP core artifact and no tracked runtime-local `lib/` tree. The bundled runtime content registry is generated during `npm run build` from canonical `src/` agents, skills, references, templates, and session blueprints, so public entrypoint stability is preserved without introducing a second hand-maintained source of truth.

Project-root resolution is also runtime-aware. Gemini and Claude prefer their explicit workspace env vars first, while Codex prefers `MAESTRO_WORKSPACE_PATH` when present and otherwise falls back to the MCP client `roots/list` response before using inherited env or `cwd` heuristics. That keeps shared session state anchored to the workspace instead of the runtime bundle location.

### Tool Catalog (40 tools)

**Workspace Pack (4 tools):**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `initialize_workspace` | workspace_path | Create state/plans directories (idempotent) |
| `assess_task_complexity` | — | Return repo signals for complexity classification |
| `validate_plan` | plan, task_complexity | Validate dependencies, file ownership, agent capabilities |
| `resolve_settings` | — | Resolve MAESTRO_* settings with precedence |

**Session Pack (12 tools):**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `create_session` | session_id, task, phases | Create active session document |
| `get_session_status` | — | Read session state |
| `update_session` | session_id | Update execution_mode/backend/batch |
| `transition_phase` | session_id | Atomically complete phase + start next |
| `archive_session` | session_id | Move session + plans to archive |
| `enter_design_gate` | session_id | Mark session entered design phase; blocks `create_session` until approval |
| `record_design_approval` | session_id + (path or inline content) | Clear design gate with approved document |
| `get_design_gate_status` | session_id | Read design gate status (entered_at, approved_at) |
| `scan_phase_changes` | session_id | Scan workspace for files created/modified since phase start |
| `reconcile_phase` | session_id, phase_id | Record file manifests + downstream context for phase |
| `search_archived_sessions` | — | Filter archived sessions by date/agent/outcome; no filters lists all (newest first) |
| `get_cost_insights` | — | Cross-session per-agent token + latency rollup |

**Content Pack (3 tools):**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `get_skill_content` | resources | Serve skills/templates/references with runtime transforms |
| `get_agent` | agents | Serve agent methodologies with tool mappings |
| `get_runtime_context` | — | Return runtime tool mappings, dispatch syntax, MCP prefixes |

**Memory Pack (15 tools):**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `get_project_profile` | — | Read the durable per-repo memory profile (learned commands, conventions, agent preferences) |
| `update_project_profile` | — | Replace supplied profile fields and persist the per-repo memory profile |
| `record_validation_commands` | commands | Fold verified build/test/lint commands into the project profile |
| `get_agent_performance` | — | Aggregate per-agent priors from the durable knowledge ledger |
| `recall_similar_sessions` | query | Rank prior archived sessions by BM25 relevance with rationale |
| `rate` | target, session_id, rating | Record a thumbs up/down rating for a session or (with phase_id) a phase |
| `get_plan_accuracy` | — | Aggregate plan-vs-actual file precision/recall from the durable knowledge ledger |
| `query_architecture_memory` | — | Query the durable architecture-memory graph folded from archived downstream context |
| `get_agent_memory` | agent | Read durable memory notes for one agent |
| `append_agent_memory` | agent, note | Append one durable memory note for one agent |
| `compact_archive` | — | Prune oldest archived session documents beyond `MAESTRO_ARCHIVE_RETENTION` without touching knowledge or checkpoints |
| `record_knowledge` | topic, note | Record a cross-project knowledge note in the out-of-tree knowledge store |
| `query_knowledge` | — | Query cross-project knowledge notes by topic or note content |
| `export_memory_pack` | — | Write one committable `memory-pack.json` artifact from durable project memory stores |
| `import_memory_pack` | — | Merge a committable `memory-pack.json` artifact back into durable project memory stores |

**History Pack (6 tools):**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `fork_session` | source_session_id, new_session_id | Fork an archived session into a new active session with lineage metadata |
| `list_lineage` | session_id | Return a session parent and direct children across active and archived sessions |
| `list_checkpoints` | session_id | List append-only per-phase checkpoints captured during session transitions |
| `restore_checkpoint` | session_id, phase_id | Restore a checkpoint by keeping completed phases and resetting later phases to pending |
| `instantiate_session_blueprint` | blueprint_id, task | Instantiate an authored blueprint into create_session-compatible phases |
| `list_session_blueprints` | — | List authored blueprints available for session planning |

## Agent System

### Agent Definitions

Each canonical agent source is either a physical file under `src/agents/` or a composed profile in `src/agent-profiles/`. The rendered agent markdown has:

- **YAML frontmatter**: name, description, color, tools (per-runtime), max_turns, temperature, timeout_mins
- **Methodology body**: role description, assessment areas, decision frameworks, anti-patterns
- **Downstream consumer contracts**: what other agents need from this agent's output

### Stub Generation

The generator creates thin stubs for each runtime. Full methodology is served via MCP at delegation time:

```markdown
Agent methodology loaded via MCP tool `get_agent`.
Call `get_agent(agents: ["architect"])` to read the full methodology at delegation time.
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

### Gemini Hooks

| Event | Script | Purpose |
|-------|--------|---------|
| `SessionStart` | session-start.js | Initialize hook state, prune stale sessions |
| `BeforeAgent` | before-agent.js | Detect agent, inject session context |
| `AfterAgent` | after-agent.js | Validate handoff report format |
| `SessionEnd` | session-end.js | Clean up hook state |

No matchers. All hooks fire unconditionally. Timeout: 10 seconds.

### Claude Hooks

| Event | Matcher | Script | Purpose |
|-------|---------|--------|---------|
| `SessionStart` | — | session-start.js | Initialize hook state |
| `PreToolUse` | `Agent` | before-agent.js | Detect agent, inject session context |
| `PreToolUse` | `Bash` | policy-enforcer.js | Block destructive commands |
| `SessionEnd` | — | session-end.js | Clean up hook state |

Uses matchers to filter by tool type. Timeout: 10s (5s for policy-enforcer). Config uses seconds; Gemini config uses milliseconds.

### Policy Enforcement

Gemini, Qwen, and Claude block the same destructive commands (`rm -rf`, `git reset --hard`, `git clean`, heredocs) and require confirmation for redirects (`>`, `>>`, `tee`):

- **Gemini**: TOML policy rules in `policies/maestro.toml`
- **Qwen**: TOML policy rules in `policies/maestro.toml`
- **Claude**: JavaScript policy-enforcer hook triggered on Bash tool use

### Qwen Hooks

| Event | Script | Purpose |
|-------|--------|---------|
| `SessionStart` | session-start.js | Initialize hook state, prune stale sessions |
| `SubagentStart` | before-agent.js | Detect agent, inject session context |
| `SubagentStop` | after-agent.js | Validate handoff report format |
| `SessionEnd` | session-end.js | Clean up hook state |

Qwen uses its own hook registration file at `qwen/hooks.json`, while reusing the repo-root hook runner and logic modules.

### Hook State

Ephemeral state stored in `/tmp/maestro-hooks-<uid>/`:
- Tracks active agent per session
- Stale directories pruned after 2 hours
- Restricted permissions (0o700)
- Atomic writes via temp file + rename

## Settings Resolution

7 configurable settings resolved with precedence: environment variable → workspace `.env` → extension `.env` → default:

<!-- BEGIN GENERATED SETTINGS -->

| Setting | Environment variable | Default | Values | Usage |
| --- | --- | --- | --- | --- |
| Disabled Agents | `MAESTRO_DISABLED_AGENTS` | (none) | comma-separated agent names | Exclude named agents from planning and delegation. |
| Max Retries | `MAESTRO_MAX_RETRIES` | `2` | non-negative integer | Limit automatic phase retries before escalation. |
| Auto Archive | `MAESTRO_AUTO_ARCHIVE` | `false` | true, false | Archive completed sessions automatically when true; prompt when false. |
| Validation | `MAESTRO_VALIDATION_STRICTNESS` | `normal` | strict, normal, lenient | Select strict, normal, or lenient validation gating. |
| State Directory | `MAESTRO_STATE_DIR` | `docs/maestro` | path | Choose the workspace-relative session and plan state root. |
| Max Concurrent | `MAESTRO_MAX_CONCURRENT` | `0` | non-negative integer (0 = entire ready batch) | Bound the native parallel dispatch chunk size. |
| Execution Mode | `MAESTRO_EXECUTION_MODE` | `ask` | ask, parallel, sequential | Choose parallel or sequential execution, or ask at the execution gate. |

<!-- END GENERATED SETTINGS -->

## CI and Testing

For detailed documentation of all seven GitHub Actions workflows, the release pipeline chain, and Mermaid flow diagrams, see [docs/cicd.md](cicd.md).

### Test Suite

180 test files using Node.js built-in `node:test`:

- 135 unit test files (`tests/unit/`)
- 14 transform test files (`tests/transforms/`)
- 31 integration test files (`tests/integration/`)

The justfile's `just test` target uses glob expansion
(`tests/unit/*.test.js`, `tests/transforms/*.test.js`, `tests/integration/*.test.js`),
so every file under those directories is picked up automatically.

### Zero-Drift Guarantee

CI regenerates runtime output and validates it against the repository:

1. Run `npm run generate`
2. Check `git diff --exit-code`
3. Fail if any tracked file differs from freshly generated output

Only the three marketplace/plugin manifest exemptions (`.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.agents/plugins/marketplace.json`) and hand-committed wrapper scripts remain tracked and diff-checked this way. The rest of the generated surface (`agents/`, `claude/`, `qwen/`, `plugins/maestro/`, `docs/runtime-*.md`, and friends) is untracked and `.gitignore`-governed — see `node dist/src/tooling/generate.js --list-outputs` after `npm run build` for the full path list — so a clean, error-free regeneration is the correctness signal there, not `git diff`.
