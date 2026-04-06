# Maestro Runtime Deduplication Design

**Date:** 2026-04-05
**Status:** Draft
**Scope:** Reduce duplication across the Gemini, Claude, and Codex runtimes while retaining the multi-runtime architecture and clone-and-use distribution model.

---

## 1. Problem Statement

Maestro generates 232 files across 3 runtimes from 142 manifest entries in `src/manifest.js`. The source tree (`src/`) contains ~95 files that must be maintained. The duplication manifests in three layers:

1. **Manifest verbosity**: 142 explicit entries where ~15 convention rules would suffice. Every new agent or skill requires editing the manifest with boilerplate output paths.
2. **Transform-driven divergence**: Shared skills go through up to 5 transforms (`skill-metadata`, `strip-feature`, `replace-tool-names`, `replace-paths`, `replace-agent-names`), producing 3 different output files per source. 46 feature flags across 9 shared skill files (7 SKILL.md + 2 protocols in `src/skills/shared/`) drive build-time conditional stripping. An additional 33 feature flags exist in agent files and references (79 total repo-wide across 31 files).
3. **Runtime preamble duplication**: Entry-point skills (orchestrate, execute, resume) embed 150+ lines of runtime mapping tables (tool syntax, MCP prefixes, agent name tables) that are static renderings of data already defined in `src/runtimes/*.js`.

### Constraints

- **Generated files must be committed.** Users install via `git clone` and use directly. No post-clone build step.
- **No symlinks.** Enterprise environments may restrict symlink creation.
- **Each runtime must be self-contained.** Gemini reads from repo root, Claude from `claude/`, Codex from `plugins/maestro/`. Each must contain all files it needs. (Codex cannot reference files outside its plugin root per `src/runtimes/codex.js:11` `relativeExtensionPath: true`.)
- **Agent files must exist on disk.** Gemini CLI auto-scans `agents/` at extension load time and registers each as a native tool from YAML frontmatter. Claude Code does the same with `claude/agents/`. (Gemini: `src/runtime-only/gemini/GEMINI.md` delegation rules section; Claude: `claude/skills/delegation/SKILL.md:1-10`)

---

## 2. Design Overview

Four independently shippable phases that build on each other:

```
Phase 1: Convention-based manifest          (generator refactor)
Phase 2: get_runtime_context MCP tool       (new MCP tool)
Phase 3: LLM-adaptive shared content        (eliminate feature flags + preambles)
Phase 4: Entry-point unification            (thin routers from registry)
```

### Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Manifest entries | 142 explicit | ~15 glob rules |
| Feature flags (shared skills only) | 46 across 9 files | 0 |
| Feature flags (repo-wide, incl. agents/refs/JS) | 79 across 31 files | ~33 (agents: 22 `exampleBlocks`, refs: 3 in `architecture.md`, JS: ~8 in MCP server + transforms) |
| Markdown transforms (shared skills) | 5 | 1 (`replace-paths`) |
| Runtime-only source files | 51 | ~24 |
| Claude thick entry-point lines | 1,429 | ~285 |
| Source files to maintain | ~95 | ~50 |
| Generated files committed | 232 | 232 (same count, more are near-identical) |

---

## 3. Phase 1: Convention-Based Manifest

### Current State

`src/manifest.js` has 142 explicit entries. Representative pattern (agents):

```js
{ src: 'agents/coder.md', transforms: ['inject-frontmatter', 'strip-feature', 'replace-tool-names', 'replace-agent-names'], outputs: { gemini: 'agents/coder.md', claude: 'claude/agents/coder.md' } },
{ src: 'agents/tester.md', transforms: ['inject-frontmatter', 'strip-feature', 'replace-tool-names', 'replace-agent-names'], outputs: { gemini: 'agents/tester.md', claude: 'claude/agents/tester.md' } },
// ...20 more identical patterns for agents alone
```

Cited: `src/manifest.js:35-78`

### Proposed State

Replace explicit entries with glob-based convention rules:

```js
module.exports = [
  // Agents — Gemini/Claude get full transforms, Codex gets strip-feature only
  { glob: 'agents/*.md',
    transforms: ['inject-frontmatter', 'strip-feature', 'replace-tool-names', 'replace-agent-names'],
    runtimes: ['gemini', 'claude'] },
  { glob: 'agents/*.md',
    transforms: ['strip-feature'],
    runtimes: ['codex'] },

  // Shared lib — byte-identical copies
  { glob: 'lib/**/*.js', transforms: ['copy'], runtimes: ['gemini', 'claude', 'codex'] },
  // lib/mcp/ handler — Gemini only
  { glob: 'lib/mcp/**/*.js', transforms: ['copy'], runtimes: ['gemini'] },

  // Shared scripts
  { glob: 'scripts/*.js', transforms: ['copy'], runtimes: ['gemini', 'claude', 'codex'] },

  // Shared templates
  { glob: 'templates/*.md', transforms: ['copy'], runtimes: ['gemini', 'claude', 'codex'] },

  // Shared references
  { glob: 'references/orchestration-steps.md', transforms: ['copy'], runtimes: ['gemini', 'claude', 'codex'] },
  // architecture.md retains replace-agent-names (agent name tables must match runtime convention)
  // and strip-feature (state contract blocks differ per runtime)
  { glob: 'references/architecture.md',
    transforms: ['strip-feature', 'replace-agent-names', 'replace-paths'],
    runtimes: ['gemini', 'claude', 'codex'] },

  // Shared skills
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-metadata', 'strip-feature', 'replace-tool-names', 'replace-paths', 'replace-agent-names'],
    runtimes: ['gemini', 'claude', 'codex'] },
  { glob: 'skills/shared/**/protocols/*.md',
    transforms: ['strip-feature', 'replace-tool-names', 'replace-paths', 'replace-agent-names'],
    runtimes: ['gemini', 'claude', 'codex'] },

  // MCP server (feature-flagged JS)
  { glob: 'mcp/maestro-server.js', transforms: ['strip-feature'], runtimes: ['gemini', 'claude', 'codex'] },

  // Hooks — runtime-specific
  { glob: 'hooks/runtime-only/gemini/*.js', transforms: ['copy'], runtimes: ['gemini'] },
  { glob: 'hooks/runtime-only/claude/*.js', transforms: ['copy'], runtimes: ['claude'] },
  { glob: 'hooks/hook-configs/gemini.json', transforms: ['copy'], runtimes: ['gemini'], outputName: 'hooks/hooks.json' },
  { glob: 'hooks/hook-configs/claude.json', transforms: ['copy'], runtimes: ['claude'], outputName: 'hooks/claude-hooks.json' },

  // Runtime-only files (explicit, no glob needed — these are unique per runtime)
  // ... ~24 remaining runtime-only entries
];
```

### Output Path Computation

The generator computes output paths from each runtime's `outputDir` and agent naming convention:

- `src/agents/code-reviewer.md` + gemini (`outputDir: './'`, `agentNaming: 'snake_case'`) → `agents/code_reviewer.md`
- `src/agents/code-reviewer.md` + claude (`outputDir: 'claude/'`, `agentNaming: 'kebab-case'`) → `claude/agents/code-reviewer.md`
- `src/agents/code-reviewer.md` + codex (`outputDir: 'plugins/maestro/'`, `agentNaming: 'kebab-case'`) → `plugins/maestro/agents/code-reviewer.md`

Naming conventions sourced from `src/runtimes/*.js:5` (`agentNaming` field).

### Changes Required

- **`scripts/generate.js`**: Add glob expansion logic. Use `fs.readdirSync` or `glob` package to resolve patterns. Compute output paths from runtime config.
- **`src/manifest.js`**: Rewrite from 160 lines to ~40 lines.
- **Stale file detection** (`scripts/generate.js:128-214`): Already walks owned directories. No change needed — it already checks `manifestPaths`.

### Risk

Low. Pure generator refactor. Generated output is byte-identical before and after. CI drift check (`generator-check.yml`) validates this.

---

## 4. Phase 2: `get_runtime_context` MCP Tool

### Motivation

Entry-point skills (orchestrate, execute, resume) embed 150+ lines of runtime mapping tables. This data already exists in `src/runtimes/*.js` and `src/lib/core/agent-registry.js`. Exposing it via MCP eliminates the need to hardcode it in skill files.

Cited evidence:
- `src/runtime-only/claude/skills/orchestrate/SKILL.md:25-133` — 109 lines of tool mappings, MCP prefixes, agent name tables, skill loading paths, settings reference
- `src/runtime-only/claude/skills/execute/SKILL.md:25-120` — 96 lines of same pattern
- `src/runtime-only/claude/skills/resume/SKILL.md` — similar structure
- `src/runtimes/claude.js` — all mapping data lives here (tools, delegationPattern, agentNaming, paths, features)
- `src/lib/core/agent-registry.js:3-51` — KNOWN_AGENTS and AGENT_CAPABILITIES already bundled into MCP server

### Design

New MCP tool `get_runtime_context` registered in `maestro-server.js`:

```js
registerTool({
  name: 'get_runtime_context',
  description: 'Returns tool mappings, agent dispatch syntax, MCP prefixes, and path variables for the current Maestro runtime. Call this once at session start (step 0) and use the returned context throughout the session.',
  inputSchema: { type: 'object', properties: {} }
}, handleGetRuntimeContext);
```

Handler returns structured JSON:

```json
{
  "runtime": "claude",
  "tools": {
    "read_file": "Read",
    "write_file": "Write",
    "replace": "Edit",
    "run_shell_command": "Bash",
    "glob": "Glob",
    "grep_search": "Grep",
    "activate_skill": "Skill",
    "write_todos": ["TaskCreate", "TaskUpdate", "TaskList"],
    "ask_user": "AskUserQuestion",
    "enter_plan_mode": "EnterPlanMode",
    "exit_plan_mode": "ExitPlanMode"
  },
  "agent_dispatch": {
    "pattern": "Agent(subagent_type: \"maestro:<name>\", prompt: \"...\")",
    "naming": "kebab-case",
    "prefix": "maestro:"
  },
  "mcp_prefix": "mcp__plugin_maestro_maestro__",
  "paths": {
    "skills": "${CLAUDE_PLUGIN_ROOT}/skills/",
    "agents": "${CLAUDE_PLUGIN_ROOT}/agents/",
    "references": "${CLAUDE_PLUGIN_ROOT}/references/",
    "templates": "${CLAUDE_PLUGIN_ROOT}/templates/",
    "scripts": "${CLAUDE_PLUGIN_ROOT}/scripts/"
  },
  "agents": ["architect", "api-designer", "code-reviewer", "coder", ...],
  "agent_capabilities": {
    "architect": "read_only",
    "coder": "full",
    "tester": "full",
    ...
  },
  "settings": {
    "MAESTRO_DISABLED_AGENTS": { "default": "", "description": "Comma-separated agent names to exclude" },
    "MAESTRO_MAX_RETRIES": { "default": "2", "description": "Phase retry limit" },
    ...
  }
}
```

### Implementation

The runtime config is **embedded at build time** into each runtime's MCP server. The mechanism:

1. Create `src/lib/mcp/handlers/get-runtime-context.js` with handler logic. The handler reads from a `RUNTIME_CONFIG` constant defined in the same file.
2. In the **source** MCP server (`src/mcp/maestro-server.js`), wrap the handler registration in a feature flag: `// @feature runtimeContext ... // @end-feature`. Set the flag to `true` in all 3 runtimes.
3. The `RUNTIME_CONFIG` constant is populated by using the **existing `strip-feature` pattern** with per-runtime feature blocks:
   ```js
   // @feature geminiRuntimeConfig
   const RUNTIME_CONFIG = { name: 'gemini', tools: { read_file: 'read_file', ... }, ... };
   // @end-feature
   // @feature claudeRuntimeConfig
   const RUNTIME_CONFIG = { name: 'claude', tools: { read_file: 'Read', ... }, ... };
   // @end-feature
   // @feature codexRuntimeConfig
   const RUNTIME_CONFIG = { name: 'codex', tools: { read_file: 'direct file reads', ... }, ... };
   // @end-feature
   ```
   Each runtime's `strip-feature` pass keeps only its config block. This uses the exact same mechanism that already conditionally includes/excludes `get_skill_content` (`src/mcp/maestro-server.js` feature flag `mcpSkillContentHandler`).
4. The agent registry data (`KNOWN_AGENTS`, `AGENT_CAPABILITIES`) is already bundled into the MCP server and can be imported directly by the handler.

**Important: MCP server bundle workflow.** `src/mcp/maestro-server.js` is a pre-built webpack bundle (~38K lines) that is checked into the source tree. It is NOT built by the generator — it is built externally (webpack) and committed. The generator treats it as a source file and applies `strip-feature` as a TEXT transform (not an AST transform) to produce per-runtime versions. This is the existing workflow: the bundle already contains `// @feature mcpSkillContentHandler` blocks that `strip-feature` processes.

Adding `RUNTIME_CONFIG` feature-flagged blocks follows the same workflow: edit the bundle to add the blocks, commit the bundle, and the generator strips them per-runtime at generation time. The handler file (`src/lib/mcp/handlers/get-runtime-context.js`) must be bundled into the MCP server via the external webpack build before the generator can process it.

Cited: MCP server bundle at `src/mcp/maestro-server.js` (~37,969 lines). `agent-registry.js` bundled at line ~34279, `setting-resolver.js` at line ~34134. Existing feature flag `mcpSkillContentHandler` at lines ~37681 and ~37940. Feature flag mechanism: `src/transforms/strip-feature.js` supports JS blocks via `// @feature name ... // @end-feature`.

### Error Handling

If `get_runtime_context` is unavailable (MCP server not started, tool not registered):

1. **Phase 3 entry-point skills retain a static fallback mapping block** — a compact version of the current preamble (~20 lines) that provides essential tool mappings, agent dispatch syntax, and MCP prefix. This block is only used when MCP is unavailable. It is NOT the primary path; `get_runtime_context` is.
2. **Codex already has this fallback pattern.** `src/runtime-only/codex/skills/maestro-orchestrate/SKILL.md:20-21` says: "If MCP tools are unavailable, use the generated scripts under `../../scripts/` and direct file operations under `docs/maestro`." The same pattern extends to all runtimes.
3. **`orchestration-steps.md` step 0 uses conditional language**: "If `get_runtime_context` appears in your available tools, call it. Otherwise, use the fallback mappings in the entry-point skill preamble." This matches the existing conditional pattern in steps 1-4 (e.g., "if `assess_task_complexity` appears in your available tools, call it").
4. **This is graceful degradation, not tool introspection.** The LLM does NOT need to guess tool names — the fallback block provides them explicitly, just more compactly than today's full preamble.

### Integration with Orchestration Flow

Update `src/references/orchestration-steps.md` to add step 0:

```
STARTUP (Turn 1 — tool calls only, no text output)
 0. Call get_runtime_context. Carry the returned mappings through the entire session.
 1. Call resolve_settings.
 2. Call initialize_workspace with resolved state_dir.
 ...
```

This is safe because:
- MCP tools are available before skill content is processed (`.mcp.json` server starts synchronously at plugin load for all 3 runtimes).
- Step 1 already calls `resolve_settings` (an MCP tool). Step 0 follows the same pattern.
- Cited: `src/runtime-only/claude/.mcp.json`, `src/runtime-only/codex/.mcp.json`, `gemini-extension.json:43-54`

### Also: Enable `get_skill_content` for Claude and Codex

Flip `mcpSkillContentHandler` from `false` to `true` in `src/runtimes/claude.js:39` and `src/runtimes/codex.js`. This gives all runtimes the ability to load skills, references, templates, and protocols via MCP.

The handler and allowlist already exist (`src/lib/mcp/handlers/get-skill-content.js:6-21`). The feature flag simply includes/excludes the handler registration in the bundled server.

### LLM Context Retention Viability

Maestro already depends on LLMs retaining information across entire sessions:
- Downstream context from phase 1 is injected into phase 5+ delegation prompts (10+ turns later). Cited: `src/skills/shared/delegation/SKILL.md:18-42`
- Agent assignments from planning carry to execution 15+ turns later. Cited: `src/skills/shared/implementation-planning/SKILL.md:74-89`
- Design depth set on turn 2 applies through turn 7+. Cited: `src/skills/shared/design-dialogue/SKILL.md:36`
- No "reload" or "refresh" patterns exist anywhere in the skills.

The MCP-provided runtime context (~660 tokens of structured JSON) is smaller than the current preamble (~1,100 tokens of markdown tables). The LLM will retain it at least as well.

### Risk

Low-medium. New MCP tool with no side effects (pure read-only). The data it returns is identical to what's currently hardcoded in entry-point skills. Phased rollout: add the tool first, validate it returns correct data, then use it in Phase 3.

---

## 5. Phase 3: LLM-Adaptive Shared Content

### Motivation

With `get_runtime_context` providing tool mappings and dispatch syntax at session start, shared skills no longer need build-time transforms to swap tool names, agent names, or strip feature flags. The LLM handles adaptation at inference time.

### Changes to Shared Skills

**Before** (`src/skills/shared/delegation/SKILL.md:157-225`):
```markdown
<!-- @feature geminiDelegation -->
...call the assigned agent's tool by its exact name — coder(query: "...")
<!-- @end-feature -->
<!-- @feature claudeDelegation -->
...call the assigned agent via the Agent tool using subagent_type: "maestro:<name>"
<!-- @end-feature -->
<!-- @feature codexDelegation -->
...use Codex-native delegation with spawn_agent(...)
<!-- @end-feature -->
```

**After**:
```markdown
## Agent Tool Dispatch Contract

Delegate to the assigned agent using the dispatch pattern from `get_runtime_context` 
(loaded at session start, step 0).

**Sequential dispatch:** Use the dispatch pattern with the agent name, providing:
- `Agent: <agent_name>`
- `Phase: <id>/<total>`
- `Batch: single`
- `Session: <session_id>`
- Full delegation prompt body

**Parallel dispatch:** Emit contiguous agent dispatch calls in one turn.
```

The LLM knows the exact dispatch syntax because it called `get_runtime_context` on turn 1. Claude's LLM uses `Agent(subagent_type: "maestro:coder", ...)`. Gemini's uses `coder(query: "...")`. Codex's uses `spawn_agent(...)`.

### Feature Flag Elimination

46 feature flags across 9 shared skill files (`src/skills/shared/`) cluster into 3 categories:

| Category | Flags | Count | Replacement |
|----------|-------|-------|-------------|
| State/hook contracts | `geminiStateContract` (8), `claudeStateContract` (8), `codexStateContract` (8), `geminiHookModel` (6), `claudeHookModel` (6) | 36 | Generic "use state management from runtime context" or combine all blocks into one with conditional prose |
| Delegation dispatch | `geminiDelegation`, `claudeDelegation`, `codexDelegation` | 3 | Generic "use dispatch pattern from runtime context" |
| Examples + prompts | `geminiAskFormat` (3), `geminiToolExamples` (2), `claudeToolExamples` (2) | 7 | Include all examples with "use the syntax matching your runtime" |

An additional 33 feature flags exist in agent files (22 agents × 1 `exampleBlocks` flag each = 22, plus 3 in `references/architecture.md`, plus 6 in `src/transforms/strip-feature.js` test patterns, plus 2 in `src/mcp/maestro-server.js`). Agent and MCP server flags are NOT affected by Phase 3 — they remain build-time transforms.

Cited: `grep -r '@feature' src/skills/shared/` (46 hits across 6 files), `grep -r '@feature' src/` (79 hits across 31 files)

### Transform Elimination

| Transform | Current usage (markdown) | After Phase 3 |
|-----------|-------------------------|---------------|
| `strip-feature` | 9 shared skill files + 22 agents + references | Eliminated for shared skills. Kept for agents (example blocks) and JS (MCP server). |
| `replace-tool-names` | 9 shared skill files + 22 agents | Eliminated for shared skills (LLM maps via runtime context). Kept for agents (frontmatter tool lists). |
| `replace-agent-names` | 9 shared skill files + references + agents | Eliminated for shared skills. **Kept for `references/architecture.md`** (agent name tables must match runtime convention). Kept for agents (filename convention). |
| `replace-paths` | 13 occurrences in shared skills + 5 in `architecture.md` | **Kept** — surviving markdown transform for shared skills and references |
| `skill-metadata` | 7 shared skills (Claude only) | **Kept** — adds `user-invocable: false` for Claude skill discovery |
| `inject-frontmatter` | 22 agent files | **Kept** — hard requirement for Gemini/Claude agent registration |

After Phase 3, shared skills use transforms: `['skill-metadata', 'replace-paths']` (2 transforms, down from 5). `references/architecture.md` retains `['replace-agent-names', 'replace-paths']` because its agent name tables must match runtime naming conventions for planning accuracy. Agent files retain all current transforms (frontmatter is a hard platform requirement). Shared skill outputs across runtimes differ ONLY in path variables and skill-metadata.

### Path Variable Handling

`replace-paths` survives because the LLM doesn't resolve path variables — the runtime does. When Claude sees `Read ${CLAUDE_PLUGIN_ROOT}/skills/delegation/SKILL.md`, Claude Code's plugin system resolves `${CLAUDE_PLUGIN_ROOT}`. The LLM passes the literal string.

Cited: Verification finding — `src/transforms/replace-paths.js` maps `${extensionPath}` to `${CLAUDE_PLUGIN_ROOT}` (Claude), `${extensionPath}` (Gemini), or computed relative paths (Codex). The LLM never interprets these variables.

The 18 occurrences are in:
- `src/skills/shared/session-management/SKILL.md`: 4 (script execution paths)
- `src/skills/shared/execution/SKILL.md`: 2 (script execution paths)
- `src/skills/shared/delegation/SKILL.md`: 7 (protocol paths, agent reference paths, tool permission references)
- `src/references/architecture.md`: 5 (state contract paths)

### Risk

Medium. Requires validating that LLMs reliably use runtime context to map generic tool/agent references. Mitigation: Phase 2 ships first with `get_runtime_context` available but not yet depended on. Shared skills are migrated incrementally — one skill at a time, validated in each runtime before proceeding.

---

## 6. Phase 4: Entry-Point Unification

### Thick Entry-Points Collapse

With `get_runtime_context` serving runtime mapping tables, Claude's thick entry-point skills lose their preambles:

| Skill | Before (lines) | Preamble (lines) | After (lines) | Reduction |
|-------|----------------|-------------------|---------------|-----------|
| orchestrate | 416 | 156 (38%) | ~85 | 80% |
| execute | 507 | 173 (34%) | ~120 | 76% |
| resume | 506 | 172 (34%) | ~80 | 84% |
| **Total** | **1,429** | **501** | **~285** | **80%** |

Cited: Line-by-line categorization from entry-point verification agent. Codex already achieves this: 78 total lines for all 3 skills by delegating to shared content.

The remaining ~285 lines are pure methodology (task complexity classification, workflow routing, Express/Standard gates, design phase behavior) that is genuinely unique to the orchestrator role and cannot be further reduced.

These thick skills remain as runtime-only files (3 per runtime = 9 total: TOML for Gemini, SKILL.md for Claude and Codex). But their content converges significantly — the methodology sections are largely identical across Claude and Codex, differing only in the loading instructions which reference the runtime context.

### Thin Entry-Points from Registry

The 9 thin entry-point skills (review, debug, archive, status, security-audit, perf-check, seo-audit, a11y-audit, compliance-check) are nearly identical across runtimes:

| Runtime | review lines | debug lines | Content |
|---------|-------------|-------------|---------|
| Claude | 29 | 27 | Load architecture, activate delegation, workflow steps |
| Codex | 20 | 16 | Load runtime-guide + architecture + delegation, workflow steps |
| Gemini | 33 | 30 | Activate skills, detect scope, delegate to agent |

Cited: `src/runtime-only/claude/skills/review/SKILL.md`, `src/runtime-only/codex/skills/maestro-review/SKILL.md`, `src/runtime-only/gemini/commands/maestro/review.toml`

Replace 27 source files (9 skills x 3 runtimes) with:

**`src/entry-points/registry.js`**:
```js
module.exports = [
  { name: 'review', description: 'Perform a Maestro-style code review with findings ordered by severity',
    agents: ['code-reviewer'], skills: ['delegation', 'code-review'], refs: ['architecture'],
    workflow: [
      'Determine review scope: explicit paths, staged changes, or last commit diff',
      'Review for correctness, regressions, maintainability risk, and missing tests',
      'Present findings first, ordered by severity, with file and line references',
      'Keep closing summary brief and only after findings',
    ],
    constraints: [
      'Do not bury findings behind a long overview',
      'If no findings, say so explicitly and note residual testing gaps',
    ] },
  { name: 'debug', description: 'Run a focused debugging workflow',
    agents: ['debugger'], skills: ['delegation'], refs: ['architecture'],
    workflow: [
      'Reproduce or narrow the failure signal',
      'Form concrete hypotheses',
      'Gather evidence from code, logs, tests, and runtime behavior',
      'Isolate the most likely root cause',
      'Verify conclusion and present recommended fix or next step',
    ],
    constraints: ['Prefer evidence over speculation', 'Make uncertainty explicit'] },
  // ...7 more entries
];
```

**3 format templates** (~30-50 lines each):
- `src/entry-points/templates/gemini-command.toml.tmpl` — TOML command format with `{{args}}` placeholder and `description`/`prompt` fields
- `src/entry-points/templates/claude-skill.md.tmpl` — SKILL.md with `${CLAUDE_PLUGIN_ROOT}` paths and YAML frontmatter
- `src/entry-points/templates/codex-skill.md.tmpl` — SKILL.md with relative `../../` paths and `maestro-` name prefix

**Per-runtime template variations are FORMAT, not content.** All three runtimes express the same workflow intent. The differences are structural:
- Gemini: TOML format with `description`/`prompt` fields, `{{args}}` user request injection, agent names in snake_case
- Claude: SKILL.md with YAML frontmatter, `${CLAUDE_PLUGIN_ROOT}` paths, agent names in kebab-case
- Codex: SKILL.md with relative paths, `maestro-` name prefix, reference to `runtime-guide.md`

Templates do NOT contain per-runtime workflow logic or conditional behavior. They wrap the SAME registry workflow steps in each runtime's structural format. Agent naming (`code-reviewer` vs `code_reviewer`) is resolved by the template using the runtime's `agentNaming` config. This is deduplication of CONTENT (registry holds canonical workflow once) with FORMAT adaptation (3 templates handle file structure).

The generator reads the registry and stamps out 27 files from 4 source files. Template engine is plain string interpolation in `scripts/generate.js` (no external dependency) — TOML output uses `description = "${description}"` and `prompt = """..."""` multi-line format, validated by the existing CI drift check.

### Risk

Low. The thin entry-points are already nearly identical. Template generation produces byte-identical output to current hand-maintained files. CI drift check validates.

---

## 7. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/lib/mcp/handlers/get-runtime-context.js` | Handler for new MCP tool |
| `src/entry-points/registry.js` | Thin entry-point definitions |
| `src/entry-points/templates/gemini-command.toml.tmpl` | Gemini TOML template |
| `src/entry-points/templates/claude-skill.md.tmpl` | Claude SKILL.md template |
| `src/entry-points/templates/codex-skill.md.tmpl` | Codex SKILL.md template |

### Modified Files

| File | Change |
|------|--------|
| `src/manifest.js` | Rewrite: explicit entries → glob rules |
| `scripts/generate.js` | Add glob expansion, output path computation, entry-point template expansion |
| `src/references/orchestration-steps.md` | Add step 0: call `get_runtime_context` |
| `src/mcp/maestro-server.js` | Register `get_runtime_context` tool, import handler |
| `src/runtimes/claude.js` | Set `mcpSkillContentHandler: true` |
| `src/runtimes/codex.js` | Set `mcpSkillContentHandler: true` |
| `src/skills/shared/*.md` (29 files) | Remove feature flags, use generic language |
| `src/runtime-only/claude/skills/orchestrate/SKILL.md` | Remove preamble tables |
| `src/runtime-only/claude/skills/execute/SKILL.md` | Remove preamble tables |
| `src/runtime-only/claude/skills/resume/SKILL.md` | Remove preamble tables |
| `src/runtime-only/codex/skills/maestro-orchestrate/SKILL.md` | Minor: reference `get_runtime_context` |
| `src/runtime-only/codex/skills/maestro-execute/SKILL.md` | Minor: reference `get_runtime_context` |
| `src/runtime-only/codex/skills/maestro-resume/SKILL.md` | Minor: reference `get_runtime_context` |

### Deleted Files (from `src/runtime-only/`)

27 thin entry-point source files replaced by registry + templates:
- `src/runtime-only/claude/skills/{review,debug,archive,status,security-audit,perf-check,seo-audit,a11y-audit,compliance-check}/SKILL.md` (9 files)
- `src/runtime-only/codex/skills/maestro-{review,debug,archive,status,security-audit,perf-check,seo-audit,a11y-audit,compliance-check}/SKILL.md` (9 files)
- `src/runtime-only/gemini/commands/maestro/{review,debug,archive,status,security-audit,perf-check,seo-audit,a11y-audit,compliance-check}.toml` (9 files)

### Unchanged

- All 22 agent source files (`src/agents/*.md`) — still need `inject-frontmatter`
- All JS library files (`src/lib/**/*.js`) — still `copy` transform
- All template files (`src/templates/*.md`) — still `copy`
- Hook scripts (`src/hooks/`) — unchanged
- Runtime configs (`src/runtimes/*.js`) — only `mcpSkillContentHandler` flag changes
- CI workflow (`.github/workflows/generator-check.yml`) — still validates drift

---

## 8. Migration Path

### Phase 1 → 2 → 3 → 4 (Sequential)

Each phase produces a working state. Phases can ship independently.

**Phase 1** can ship immediately — it's a generator refactor with no runtime behavior change. CI drift check validates output is identical.

**Phase 2** ships the `get_runtime_context` tool. It's additive — existing skills don't use it yet. Validate the tool returns correct data for each runtime by comparing its output to the current hardcoded preambles.

**Phase 3** migrates shared skills incrementally. Start with the least critical skill (e.g., `code-review`), remove its feature flags, validate in all 3 runtimes, then proceed to the next. Roll back individual skills if issues arise.

**Phase 4** templates thin entry-points and collapses thick preambles. Validate by diffing generated output against current output.

### Rollback

Each phase is independently reversible:
- Phase 1: revert `manifest.js` and `generate.js`
- Phase 2: remove `get_runtime_context` tool registration, revert step 0
- Phase 3: restore feature flags in shared skills, re-enable transforms
- Phase 4: restore hand-maintained entry-point files, remove registry/templates

---

## 9. Testing Strategy

### Per-Phase Validation

1. **Phase 1**: Run `node scripts/generate.js --diff`. Output must be byte-identical to pre-refactor. CI drift check passes.
2. **Phase 2**: Unit test `get_runtime_context` handler. Compare output against `src/runtimes/*.js` for each runtime. Integration test: invoke via MCP client for each runtime.
3. **Phase 3**: For each migrated skill, diff the generated output against the pre-migration output. Verify the LLM-adaptive content produces equivalent behavior by running a representative orchestration in each runtime.
4. **Phase 4**: Diff generated thin entry-points against current hand-maintained versions. Run each standalone command (review, debug, etc.) in each runtime.

### Ongoing

- CI drift check (`generator-check.yml`) continues to validate generated output matches source.
- Stale file detection (`scripts/generate.js:128-214`) catches orphaned files.
