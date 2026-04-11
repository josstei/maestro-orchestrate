# Maestro Architecture

## System Design

Maestro follows a **src-first, generated-runtime** architecture. Shared behavior and shared content are authored exactly once under `src/`. Runtime roots (`./`, `claude/`, and `plugins/maestro/`) contain the manifests, entrypoints, discovery stubs, public adapter files, and any generator-owned runtime payloads each host requires.

```
                    ┌─────────────┐
                    │   src/      │
                    │  (source    │
                    │   of truth) │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ generate.js │
                    │  + manifest │
                    │  + transforms│
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Gemini    │ │   Claude    │ │    Codex    │
    │   (root)    │ │  (claude/)  │ │(plugins/    │
    │             │ │             │ │  maestro/)  │
    └─────────────┘ └─────────────┘ └─────────────┘
```

## Generator Pipeline

The generator (`scripts/generate.js`) is the build boundary between canonical source and runtime adapters. It:

1. Loads runtime configs from `src/platforms/*/runtime-config.js`
2. Expands manifest rules from `src/manifest.js` into concrete runtime outputs
3. Copies or transforms the public adapter assets and any generator-owned runtime payloads each runtime needs
4. Expands the entry-point registry into runtime-specific command or skill surfaces
5. Prunes stale generated adapter files from owned directories

### Manifest System

`src/manifest.js` declares how source files map to outputs. Each entry specifies:

```javascript
{
  src: 'agents/architect.md',           // Source file
  transforms: ['inject-frontmatter', 'agent-stub'],  // Transform pipeline
  runtimes: ['gemini', 'claude'],       // Target runtimes
}
```

Or with glob patterns:

```javascript
{
  glob: 'agents/*.md',
  transforms: ['inject-frontmatter', 'agent-stub'],
  runtimes: ['gemini', 'claude'],
}
```

### Transform Pipeline

The generator exposes 4 transforms. Current manifest entries use a subset depending on the target surface.

| Transform | Purpose |
|-----------|---------|
| `inject-frontmatter` | Rebuild YAML frontmatter per runtime (tools, fields, examples) |
| `agent-stub` | Replace agent body with MCP delegation directive |
| `skill-discovery-stub` | Create minimal skill header pointing to MCP |
| `skill-metadata` | Add `user-invocable: false` for Claude skills |

### Runtime Definitions

Each runtime (`src/platforms/*/runtime-config.js`) declares:

| Field | Gemini | Claude | Codex |
|-------|--------|--------|-------|
| `outputDir` | `./` | `claude/` | `plugins/maestro/` |
| `agentNaming` | `snake_case` | `kebab-case` | `kebab-case` |
| `delegationPattern` | `{{agent}}(query: "...")` | `Agent(subagent_type: "maestro:{{agent}}", prompt: "...")` | `spawn_agent(...)` |
| `env.extensionPath` | `extensionPath` | `CLAUDE_PLUGIN_ROOT` | `.` (relative) |
| `env.workspacePath` | `workspacePath` | `CLAUDE_PROJECT_DIR` | `MAESTRO_WORKSPACE_PATH` |

### Entry-Point Registry

9 entry-points defined in `src/entry-points/registry.js`, each with workflow steps, constraints, agent assignments, and skill references. Generated into:

- Gemini: TOML commands in `commands/maestro/`
- Claude: Markdown skills in `claude/skills/`
- Codex: Markdown skills in `plugins/maestro/skills/*/`, invoked as `$maestro:<skill>`

Entry-points: review, debug, archive, status, security-audit, perf-check, seo-audit, a11y-audit, compliance-check.

Plus 3 core commands (orchestrate, execute, resume) maintained separately in `src/entry-points/core-command-registry.js`.

## MCP Server Architecture

The MCP server is authored directly in modular source under `src/mcp/`. Runtime roots expose thin public wrappers that resolve into the nearest generator-owned `src/mcp/maestro-server.js` payload.

### Module Structure

```
src/mcp/
├── maestro-server.js           # Server entry-point (runRuntimeServer)
├── content/
│   ├── provider.js             # Content provider abstraction
│   └── runtime-content.js      # Runtime-specific content resolution
├── core/
│   ├── create-server.js        # Server factory + error sanitization
│   ├── tool-registry.js        # Tool schema/handler composition
│   └── recovery-hints.js       # Error → recovery guidance mapping
├── handlers/                   # 8 handler implementations
│   ├── get-agent.js            # Agent methodology serving
│   ├── get-skill-content.js    # Skill/template/reference serving
│   ├── get-runtime-context.js  # Runtime config snapshot
│   ├── initialize-workspace.js # Directory setup
│   ├── assess-task-complexity.js # Repo analysis signals
│   ├── validate-plan.js        # Plan validation + dependency DAG
│   ├── resolve-settings.js     # Config resolution
│   └── session-state-tools.js  # Session CRUD (5 tools)
├── tool-packs/
│   ├── index.js                # Tool pack aggregation
│   ├── contracts.js            # Tool schema contracts
│   ├── workspace/index.js      # 4 tools
│   ├── session/index.js        # 5 tools
│   └── content/index.js        # 3 tools
├── utils/
│   └── extension-root.js       # Path resolution
└── runtime/
    └── runtime-config-map.js   # Runtime config registry
```

### Content Serving and Path Resolution

The content tools (`get_agent`, `get_skill_content`) are filesystem-only in every runtime:

- Gemini: `primary=filesystem`, `fallback=none`
- Claude: `primary=filesystem`, `fallback=none`
- Codex: `primary=filesystem`, `fallback=none`

Each runtime's thin entrypoint at `mcp/maestro-server.js` uses direct `require()` calls to resolve `src/mcp/maestro-server.js`. Gemini's entrypoint sets `MAESTRO_RUNTIME=gemini` and requires `../src/mcp/maestro-server` directly. Claude and Codex use dual-resolution: they prefer the repo-level `src/mcp/maestro-server.js` via `fs.existsSync()` and fall back to the bundled detached payload (`claude/src/mcp/maestro-server.js` or `plugins/maestro/src/mcp/maestro-server.js`) when running outside the repo.

This makes one architectural rule explicit:

- shared logic lives under `src/config`, `src/core`, `src/state`, `src/hooks/logic`, and `src/mcp`
- root `src/` is the only human-authored source of truth
- generator-owned runtime-local mirrors are allowed when a bundled runtime needs self-containment
- no hand-maintained runtime forks are allowed

### MCP Server Packaging

Each runtime keeps the public entrypoint at `mcp/maestro-server.js`, but that file is only a thin wrapper:

- **Gemini** (`mcp/maestro-server.js`): sets `MAESTRO_RUNTIME=gemini`, directly requires `../src/mcp/maestro-server` and calls `.main()`
- **Claude** (`claude/mcp/maestro-server.js`): sets `MAESTRO_RUNTIME=claude`, uses `fs.existsSync()` to prefer repo `../../src/mcp/maestro-server.js` with fallback to bundled `../src/mcp/maestro-server.js`
- **Codex** (`plugins/maestro/mcp/maestro-server.js`): sets `MAESTRO_RUNTIME=codex`, uses the same dual-resolution as Claude — prefers repo `../../../src/mcp/maestro-server.js` with fallback to bundled `../src/mcp/maestro-server.js`

There is no tracked generated MCP core artifact, no tracked runtime-local `lib/` tree, and no bundled content registry. Public entrypoint stability is preserved without introducing a second hand-maintained source of truth.

Project-root resolution is also runtime-aware. Gemini and Claude prefer their explicit workspace env vars first, while Codex prefers `MAESTRO_WORKSPACE_PATH` when present and otherwise falls back to the MCP client `roots/list` response before using inherited env or `cwd` heuristics. That keeps shared session state anchored to the workspace instead of the runtime bundle location.

### Tool Catalog (12 tools)

**Workspace Pack:**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `initialize_workspace` | — | Create state/plans directories (idempotent) |
| `assess_task_complexity` | — | Return repo signals for complexity classification |
| `validate_plan` | plan, task_complexity | Validate dependencies, file ownership, agent capabilities |
| `resolve_settings` | — | Resolve MAESTRO_* settings with precedence |

**Session Pack:**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `create_session` | session_id, task, phases | Create active session document |
| `get_session_status` | — | Read session state |
| `update_session` | session_id | Update execution_mode/backend/batch |
| `transition_phase` | session_id | Atomically complete phase + start next |
| `archive_session` | session_id | Move session + plans to archive |

**Content Pack:**

| Tool | Required Params | Purpose |
|------|----------------|---------|
| `get_skill_content` | resources | Serve skills/templates/references with runtime transforms |
| `get_agent` | agents | Serve agent methodologies with tool mappings |
| `get_runtime_context` | — | Return runtime tool mappings, dispatch syntax, MCP prefixes |

## Agent System

### Agent Definitions

Each agent in `src/agents/` has:

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

Both runtimes block the same destructive commands (`rm -rf`, `git reset --hard`, `git clean`, heredocs) and require confirmation for redirects (`>`, `>>`, `tee`):

- **Gemini**: TOML policy rules in `policies/maestro.toml`
- **Claude**: JavaScript policy-enforcer hook triggered on Bash tool use

### Hook State

Ephemeral state stored in `/tmp/maestro-hooks-<uid>/`:
- Tracks active agent per session
- Stale directories pruned after 2 hours
- Restricted permissions (0o700)
- Atomic writes via temp file + rename

## Settings Resolution

7 configurable settings resolved with precedence: environment variable → workspace `.env` → extension `.env` → default:

| Setting | Default | Purpose |
|---------|---------|---------|
| `MAESTRO_STATE_DIR` | `docs/maestro` | Session state directory |
| `MAESTRO_DISABLED_AGENTS` | (none) | Comma-separated excluded agents |
| `MAESTRO_EXECUTION_MODE` | `ask` | parallel/sequential/ask |
| `MAESTRO_VALIDATION_STRICTNESS` | `normal` | strict/normal/lenient |
| `MAESTRO_AUTO_ARCHIVE` | `true` | Auto-archive on completion |
| `MAESTRO_MAX_RETRIES` | `2` | Max retries per phase |
| `MAESTRO_MAX_CONCURRENT` | `0` | Max parallel agents (0 = unlimited) |

## CI and Testing

### Test Suite

22 test files with 121 tests using Node.js built-in `node:test`:

- 12 transform/unit tests
- 10 integration tests
- The justfile `just test` lists 12 test files, but 5 of those reference deleted transform tests (copy, strip-feature, replace-agent-names, replace-tool-names, replace-paths). Only 7 of the 12 listed files still exist. 15 of 22 total test files are not yet wired into CI.

### Zero-Drift Guarantee

CI validates that generated output matches committed state:

1. Run `node scripts/generate.js`
2. Check `git diff --exit-code`
3. Fail if any generated file differs from source

Note: The justfile `just test` lists 12 test files, but 5 reference deleted transforms and will fail. Of the 22 current test files, only 7 are wired into CI via the justfile. The justfile needs updating to remove stale entries and add the remaining test files.
