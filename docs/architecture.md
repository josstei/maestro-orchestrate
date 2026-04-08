# Maestro Architecture

## System Design

Maestro follows a **single-source, multi-target** architecture. All content lives in `src/` and is transformed into three runtime-specific outputs by the generator.

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

The generator (`scripts/generate.js`, 568 lines) is the core build tool. It:

1. Loads runtime configs from `src/runtimes/*.js`
2. Expands manifest rules from `src/manifest.js` into concrete entries
3. For each entry: reads source → applies transforms → writes output
4. Expands entry-point registry into commands/skills per runtime
5. Prunes stale files from owned directories

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

10 transforms applied in order per manifest entry:

| Transform | Purpose |
|-----------|---------|
| `copy` | Pass-through (no modification) |
| `inject-frontmatter` | Rebuild YAML frontmatter per runtime (tools, fields, examples) |
| `agent-stub` | Replace agent body with MCP delegation directive |
| `skill-discovery-stub` | Create minimal skill header pointing to MCP |
| `strip-feature` | Remove/keep feature-flagged blocks per runtime |
| `replace-agent-names` | Convert between kebab-case and snake_case |
| `replace-tool-names` | Map canonical tool names to runtime equivalents |
| `replace-paths` | Substitute path placeholders with runtime env vars |
| `skill-metadata` | Add `user-invocable: false` for Claude skills |
| `inline-runtime` | Inline single-runtime config for bundled server |

### Runtime Definitions

Each runtime (`src/runtimes/*.js`) declares:

| Field | Gemini | Claude | Codex |
|-------|--------|--------|-------|
| `outputDir` | `./` | `claude/` | `plugins/maestro/` |
| `agentNaming` | `snake_case` | `kebab-case` | `kebab-case` |
| `delegationPattern` | `{{agent}}(query: "...")` | `Agent(subagent_type: "maestro:{{agent}}")` | `spawn_agent(...)` |
| `env.extensionPath` | `extensionPath` | `CLAUDE_PLUGIN_ROOT` | `.` (relative) |
| `env.workspacePath` | `workspacePath` | `CLAUDE_PROJECT_DIR` | (not used) |

### Entry-Point Registry

9 entry-points defined in `src/entry-points/registry.js`, each with workflow steps, constraints, agent assignments, and skill references. Generated into:

- Gemini: TOML commands in `commands/maestro/`
- Claude: Markdown skills in `claude/skills/`
- Codex: Markdown skills in `plugins/maestro/skills/maestro-*/`

Entry-points: review, debug, archive, status, security-audit, perf-check, seo-audit, a11y-audit, compliance-check.

Plus 3 core commands (orchestrate, execute, resume) maintained separately in `src/runtime-only/`.

## MCP Server Architecture

The MCP server is built from modular source in `src/lib/mcp/` and bundled into a single file per runtime via esbuild.

### Module Structure

```
src/lib/mcp/
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
├── tool-packs/                 # Tool grouping
│   ├── workspace/index.js      # 4 tools
│   ├── session/index.js        # 5 tools
│   └── content/index.js        # 3 tools
├── utils/
│   └── extension-root.js       # Path resolution
└── runtime/
    └── runtime-config-map.js   # Runtime config registry
```

### Content Serving and Path Resolution

The content tools (`get_agent`, `get_skill_content`) resolve content through a runtime-specific provider policy:

- Gemini: `primary=filesystem`, `fallback=none`
- Claude: `primary=filesystem`, `fallback=none`
- Codex: `primary=registry`, `fallback=filesystem`

Filesystem-backed reads still use the canonical `src/` tree:

```
resolveExtensionRoot() → path.dirname(process.argv[1]) + '..'
resolveSrcRoot(relativePath) → extensionRoot + relativePath
```

Each bundled server passes a different `srcRelativePath` when filesystem access is enabled:
- Gemini (`mcp/maestro-server.js`): `"src"` → resolves to `./src/`
- Claude (`claude/mcp/maestro-server.js`): `"../src"` → resolves to `./src/`
- Codex (`plugins/maestro/mcp/maestro-server.js`): `"../../src"` → resolves to `./src/` as a workspace/dev fallback only

Registry-backed reads load runtime-ready modules from `lib/mcp/generated/` inside the installed plugin bundle. That makes packaged Codex installs self-contained while preserving filesystem fallback for repo-local development.

### MCP Server Packaging

Each runtime keeps the public entrypoint at `mcp/maestro-server.js`, but that file is now a thin wrapper:

- It loads the runtime-local generated config from `lib/mcp/runtime/runtime-config-map.js`
- It picks the runtime's `srcRelativePath`
- It delegates protocol handling and tool registration to `mcp/maestro-server-core.js`

`mcp/maestro-server-core.js` is a generated self-contained artifact built from `src/mcp/server-core-entry.js`. This keeps runtime entrypoints stable while ensuring live behavior comes from the decomposed `src/lib/mcp/**` source tree instead of a stale monolith.

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

21 test files with 159 tests using Node.js built-in `node:test`:

- 16 transform/unit tests
- 5 integration tests
- CI runs 12 of 21 files (121 of 159 tests); 9 files (38 tests) not yet wired into CI

### Zero-Drift Guarantee

CI validates that generated output matches committed state:

1. Run `node scripts/generate.js`
2. Check `git diff --exit-code`
3. Fail if any generated file differs from source

Note: CI and `just test` run 12 of 21 test files (121 of 159 tests). The remaining 38 tests (MCP pack tests, entry-point templates, glob manifest, server entrypoint) are not yet wired into CI.
