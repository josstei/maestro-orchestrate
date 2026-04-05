# Runtime Generator Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Goal:** Eliminate duplication between Gemini and Claude runtimes by introducing a config-driven transformation pipeline that generates all runtime-specific files from a single source of truth.

---

## Problem

The Gemini (root) and Claude (`claude/`) runtimes share significant content — 17+ byte-identical files, 22 agents with identical methodology but different frontmatter, 7 skills with tool/path swaps, and an MCP server with a small feature diff. This duplication creates maintenance burden and drift risk. The existing `check-claude-lib-drift.sh` script only covers `lib/` files, leaving agents, skills, references, and MCP unchecked.

## Approach: Config-Driven Transformation Pipeline

A declarative manifest defines every source file, its transforms, and output paths per runtime. Runtime config objects encode all differences (tool names, naming conventions, env vars, feature flags). Adding a new runtime means adding one config file and output paths in the manifest.

---

## 1. Source Directory Structure

All source material lives in `src/` at the project root. Current output directories (root-level Gemini files and `claude/`) become generated artifacts.

```
src/
├── manifest.js                    # Every source file, its transforms, and output paths
├── runtimes/
│   ├── gemini.js                  # Runtime config: tool map, naming, env vars, features
│   ├── claude.js                  # Runtime config: tool map, naming, env vars, features
│   └── shared.js                  # Shared constants (agent list, skill list, etc.)
├── agents/
│   ├── _frontmatter/
│   │   ├── gemini.yaml            # Frontmatter template per runtime
│   │   └── claude.yaml            # Frontmatter template per runtime
│   └── code-reviewer.md           # Methodology prose + canonical frontmatter
│   └── architect.md
│   └── ...                        # All 22 agents
├── skills/
│   ├── shared/                    # The 7 core skills (methodology content)
│   │   ├── code-review/SKILL.md
│   │   ├── delegation/SKILL.md
│   │   └── ...
│   ├── delegation/protocols/      # Shared protocol files
│   └── ...
├── lib/                           # All shared library files
│   ├── core/
│   ├── config/
│   ├── hooks/
│   ├── state/
│   └── mcp/                       # Gemini-only source (feature-flagged)
├── scripts/                       # Shared utility scripts
├── templates/                     # Session state, design doc, impl plan templates
├── references/
│   ├── orchestration-steps.md
│   └── architecture.md            # Has agent name markers
├── mcp/
│   └── maestro-server.js          # Unified MCP source with feature flags
├── hooks/
│   ├── shared/                    # Hook scripts with shared logic
│   │   ├── session-start.js
│   │   ├── session-end.js
│   │   └── before-agent.js
│   ├── runtime-only/
│   │   ├── gemini/
│   │   │   ├── hook-adapter.js    # Gemini-specific: maps prompt/prompt_response
│   │   │   └── after-agent.js     # Gemini-only: no Claude equivalent
│   │   └── claude/
│   │       └── hook-adapter.js    # Claude-specific: maps tool_input.subagent_type
│   └── hook-configs/
│       ├── gemini.json            # BeforeAgent/AfterAgent event model
│       └── claude.json            # PreToolUse with matcher-based targeting
└── runtime-only/                  # Files with no counterpart in other runtimes
    ├── gemini/
    │   ├── GEMINI.md
    │   ├── gemini-extension.json
    │   ├── .geminiignore
    │   ├── policies/maestro.toml
    │   └── commands/maestro/*.toml
    └── claude/
        ├── README.md
        ├── .claude-plugin/plugin.json
        ├── .mcp.json
        ├── mcp-config.example.json
        ├── scripts/policy-enforcer.js
        ├── scripts/policy-enforcer.test.js
        └── skills/               # 12 command-specific skills
            ├── orchestrate/SKILL.md
            ├── review/SKILL.md
            └── ...
```

---

## 2. Runtime Configuration

Each runtime exports a config object that the transformation pipeline uses to resolve differences. This is where all runtime-specific knowledge lives.

```js
// src/runtimes/claude.js
module.exports = {
  name: 'claude',
  outputDir: 'claude/',

  // Naming convention
  agentNaming: 'kebab-case',     // code-reviewer

  // Environment variables
  env: {
    extensionPath: 'CLAUDE_PLUGIN_ROOT',
    workspacePath: 'CLAUDE_PROJECT_DIR',
  },

  // Tool name mapping (canonical name -> this runtime's name)
  tools: {
    read_file: 'Read',
    list_directory: 'Glob',
    glob: 'Glob',
    grep_search: 'Grep',
    google_web_search: 'WebSearch',
    web_fetch: 'WebFetch',
    write_file: 'Write',
    replace: 'Edit',
    run_shell_command: 'Bash',
    ask_user: 'AskUserQuestion',
    read_many_files: 'Read',
    write_todos: ['TaskCreate', 'TaskUpdate', 'TaskList'],
    activate_skill: 'Skill',
  },

  // Agent frontmatter fields
  agentFrontmatter: {
    model: 'inherit',
    // color is per-agent — read from source frontmatter `color` field
    turnsField: 'maxTurns',      // camelCase in Claude
  },

  // Agent delegation syntax
  delegationPattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',

  // Feature flags
  features: {
    mcpSkillContentHandler: false,
    policyEnforcer: true,
    exampleBlocks: true,          // Claude agents include <example> blocks
    geminiHookModel: false,
    claudeHookModel: true,
    geminiDelegation: false,
    claudeDelegation: true,
    geminiToolExamples: false,
    claudeToolExamples: true,
    geminiAskFormat: false,
  },

  // Path templates
  paths: {
    skills: '${CLAUDE_PLUGIN_ROOT}/skills/',
    hooks: '${CLAUDE_PLUGIN_ROOT}/scripts/',
  },
};
```

```js
// src/runtimes/gemini.js
module.exports = {
  name: 'gemini',
  outputDir: './',                // Root directory

  agentNaming: 'snake_case',     // code_reviewer

  env: {
    extensionPath: 'MAESTRO_EXTENSION_PATH',
    workspacePath: 'MAESTRO_WORKSPACE_PATH',
  },

  tools: {
    // Identity mapping -- gemini names are the canonical source names
    read_file: 'read_file',
    list_directory: 'list_directory',
    glob: 'glob',
    grep_search: 'grep_search',
    google_web_search: 'google_web_search',
    web_fetch: 'web_fetch',
    write_file: 'write_file',
    replace: 'replace',
    run_shell_command: 'run_shell_command',
    ask_user: 'ask_user',
    read_many_files: 'read_many_files',
    write_todos: 'write_todos',
    activate_skill: 'activate_skill',
  },

  agentFrontmatter: {
    kind: 'local',
    turnsField: 'max_turns',     // snake_case in Gemini
    hasTemperature: true,
    hasTimeout: true,
  },

  delegationPattern: '{{agent}}(query: "...")',

  features: {
    mcpSkillContentHandler: true,
    policyEnforcer: false,
    exampleBlocks: false,
    geminiHookModel: true,
    claudeHookModel: false,
    geminiDelegation: true,
    claudeDelegation: false,
    geminiToolExamples: true,
    claudeToolExamples: false,
    geminiAskFormat: true,
  },

  paths: {
    skills: '${extensionPath}/skills/',
    hooks: '${extensionPath}/hooks/',
  },
};
```

**Key principle:** Source files use canonical names (e.g. tool names use a neutral form like `read_file`), and each runtime config defines how to map those to its output. Adding a third runtime means adding one new config file.

---

## 3. Transformation Pipeline

### Transform Functions

Each transform is a pure function: `(content, runtimeConfig, fileContext) -> content`. They compose left to right.

```
copy                  — Pass through unchanged
replace-tool-names    — Swap canonical tool names -> runtime tool names
replace-env-vars      — Swap canonical env var references -> runtime env vars
replace-agent-names   — Swap canonical agent names -> runtime naming convention
replace-paths         — Swap canonical path templates -> runtime paths
inject-frontmatter    — Build runtime-specific YAML frontmatter for agents
inject-examples       — Add <example> blocks if runtime.features.exampleBlocks
strip-feature         — Remove feature-flagged blocks when flag is false
inject-feature        — Add feature-flagged blocks when flag is true
skill-metadata        — Add runtime-specific frontmatter to skills
```

### Manifest Structure

```js
// src/manifest.js
module.exports = [
  // --- Files templated through the engine (identical today) ---
  {
    src: 'lib/core/atomic-write.js',
    transforms: ['copy'],
    outputs: {
      gemini: 'lib/core/atomic-write.js',
      claude: 'claude/lib/core/atomic-write.js',
    },
  },

  // --- Files with dual env var support (both runtimes' vars on same line) ---
  // These are byte-identical across runtimes today. The source preserves the
  // dual-env-var pattern (e.g. MAESTRO_EXTENSION_PATH || CLAUDE_PLUGIN_ROOT)
  // so both runtimes can read them. Treated as copy, not env-var replacement.
  {
    src: 'lib/config/setting-resolver.js',
    transforms: ['copy'],
    outputs: {
      gemini: 'lib/config/setting-resolver.js',
      claude: 'claude/lib/config/setting-resolver.js',
    },
  },

  // --- Agent definitions ---
  {
    src: 'agents/code-reviewer.md',
    transforms: ['inject-frontmatter', 'replace-tool-names', 'replace-agent-names', 'inject-examples'],
    outputs: {
      gemini: 'agents/code_reviewer.md',
      claude: 'claude/agents/code-reviewer.md',
    },
  },

  // --- Shared skills ---
  // Skills contain feature-flagged blocks for runtime-specific content:
  // hook lifecycle descriptions, delegation dispatch syntax, and tool
  // restriction examples differ structurally between runtimes.
  {
    src: 'skills/shared/execution/SKILL.md',
    transforms: ['skill-metadata', 'strip-feature', 'replace-tool-names', 'replace-paths', 'replace-agent-names'],
    outputs: {
      gemini: 'skills/execution/SKILL.md',
      claude: 'claude/skills/execution/SKILL.md',
    },
  },

  // --- References with naming swaps ---
  {
    src: 'references/architecture.md',
    transforms: ['replace-agent-names', 'replace-paths'],
    outputs: {
      gemini: 'references/architecture.md',
      claude: 'claude/references/architecture.md',
    },
  },

  // --- MCP server with feature flags ---
  // NOTE: The current MCP server files are pre-bundled (~38K lines with inlined
  // dependencies). Feature flags must be applied to the pre-bundle source. The
  // bundling step itself is outside the generator's scope — it runs separately
  // before generation, producing the source file that the generator then
  // feature-flags and distributes. If the MCP source is maintained as unbundled
  // modules in the future, the generator can operate on those directly.
  {
    src: 'mcp/maestro-server.js',
    transforms: ['strip-feature:mcpSkillContentHandler'],
    outputs: {
      gemini: 'mcp/maestro-server.js',
      claude: 'claude/mcp/maestro-server.js',
    },
  },

  // --- Runtime-only files (passthrough) ---
  {
    src: 'runtime-only/gemini/GEMINI.md',
    transforms: ['copy'],
    outputs: { gemini: 'GEMINI.md' },
  },
  {
    src: 'runtime-only/claude/skills/orchestrate/SKILL.md',
    transforms: ['copy'],
    outputs: { claude: 'claude/skills/orchestrate/SKILL.md' },
  },
];
```

### Generator Execution Flow

1. Load `manifest.js`
2. Load all runtime configs from `src/runtimes/`
3. For each manifest entry:
   a. Read source file
   b. For each runtime that has an output path:
      - Apply transforms in order, passing runtime config
      - Write to output path
4. Report: files written, files unchanged, errors

---

## 4. Feature Flags for Conditional Content

Source files mark runtime-conditional blocks with lightweight delimiters.

### Markdown Syntax

```markdown
Shared content here.

<!-- @feature mcpSkillContentHandler -->
This block only appears in runtimes where mcpSkillContentHandler is true.
<!-- @end-feature -->

More shared content.
```

### JS Syntax

```js
// Shared code

// @feature mcpSkillContentHandler
const skillHandler = require('./handlers/get-skill-content.js');
// @end-feature

// More shared code
```

### Rules

- If `runtime.features[flagName]` is `false`, the block between markers is removed (including markers). If `true`, markers are stripped but content is kept.
- Markers never appear in generated output.
- Features can be nested; evaluated innermost first.
- Unknown feature names cause the generator to error, preventing typos from silently dropping content.

### Agent Example Blocks

Claude agents include `<example>` blocks that Gemini agents don't. These live in the agent source as a feature-flagged section:

```markdown
---
canonical frontmatter
---

<!-- @feature exampleBlocks -->
<example>
Context: User needs REST API contracts designed.
...
</example>
<!-- @end-feature -->

## Methodology
Shared methodology prose...
```

### Skill-Specific Feature Flags

Shared skills have structural content differences beyond mechanical tool/path swaps. These sections must be feature-flagged in the source:

- **Hook lifecycle descriptions** — Gemini describes `BeforeAgent`/`AfterAgent` events; Claude describes `PreToolUse` with matcher-based targeting and inline validation. Feature flag: `geminiHookModel` / `claudeHookModel`.
- **Agent delegation dispatch syntax** — Gemini calls agents directly by tool name (`coder(query: ...)`); Claude uses the Agent tool (`Agent(subagent_type: "maestro:coder", prompt: ...)`). Feature flag: `geminiDelegation` / `claudeDelegation`.
- **Tool restriction examples** — Code examples showing file writing rules, shell command restrictions, etc. reference different tool names and patterns per runtime. Feature flag: `geminiToolExamples` / `claudeToolExamples`.
- **Structured question format** — Gemini skills include JSON examples for `ask_user` with `type: 'choice'`; Claude skills omit these (different interaction model). Feature flag: `geminiAskFormat`.

---

## 5. Agent Frontmatter Injection

Agent source files contain canonical metadata and methodology prose. The `inject-frontmatter` transform builds runtime-specific YAML frontmatter.

### Agent Source Format

```markdown
---
name: code-reviewer
description: Code review specialist for identifying bugs, security vulnerabilities, and code quality issues.
color: blue
tools: [read_file, glob, grep_search]
max_turns: 15
temperature: 0.3
timeout_mins: 5
---

<!-- @feature exampleBlocks -->
<example>...</example>
<!-- @end-feature -->

## Methodology
...
```

### Frontmatter Injection Steps

1. Parse the canonical YAML frontmatter from the source
2. Map `name` through the runtime's naming convention (`agentNaming`)
3. Map each entry in `tools` through `runtime.tools`
4. Rename fields per runtime config (`max_turns` -> `maxTurns` for Claude, kept as-is for Gemini)
5. Add runtime-specific fields (`kind: local` for Gemini, `model: inherit` for Claude)
6. Include `color` from source frontmatter for Claude; drop it for Gemini (Gemini has no color field)
7. Drop fields the runtime doesn't use (`temperature` and `timeout_mins` excluded from Claude)
8. Serialize back to YAML frontmatter and prepend to the body

### Per-Agent Runtime Overrides

When tool mapping isn't a simple 1:1 swap:

```yaml
---
name: architect
tools: [read_file, glob, grep_search]
tools.gemini: [read_file, list_directory, glob, grep_search, google_web_search, read_many_files, ask_user, web_fetch]
tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]
---
```

When a `tools.<runtime>` key exists, it takes precedence over the base `tools` for that runtime.

**Note:** Most agents will require `tools.<runtime>` overrides. The tool surfaces diverge significantly between runtimes — not just in naming but in which tools are available. For example, Gemini's `debugger` has 8 tools while Claude's has 4. The base `tools` field serves as documentation of the agent's logical capabilities; the per-runtime overrides are the source of truth for actual tool lists.

---

## 6. Output Directory Management and Safety

### What the Generator Owns

All files declared in the manifest. Both Gemini output (project root) and Claude output (`claude/`).

### What the Generator Does NOT Own

- `CLAUDE.md` — project instructions
- `.gitignore`, `.github/`, and repo infrastructure
- `docs/` — design docs, session state, user-created content
- `src/` — the source of truth itself
- `package.json` / `package-lock.json`
- `scripts/generate.js` — the generator itself
- `scripts/check-claude-lib-drift.sh` — superseded but kept until migration completes

### Safety Mechanisms

1. **Manifest is exhaustive** — only writes files declared in the manifest. No glob-based "copy everything."
2. **Stale file detection** — after generation, compares written files against files in output directories. Files that exist but aren't in the manifest are reported as warnings.
3. **Dry-run mode** — `node scripts/generate.js --dry-run` reports what would change without writing.
4. **Diff mode** — `node scripts/generate.js --diff` shows unified diff of what would change.
5. **Clean mode** — `node scripts/generate.js --clean` removes all generator-owned files before regenerating.

### CI Check

```yaml
- run: node scripts/generate.js
- run: git diff --exit-code --name-only
```

Replaces `check-claude-lib-drift.sh` — covers everything that script checked plus all other duplicated files.

---

## 7. Migration Strategy

### Phase 1: Build the Generator Alongside Existing Files

- Create `src/` directory and populate from current files (extracting canonical source from existing Gemini/Claude files)
- Build the generator and transform functions
- Run the generator and diff its output against current committed files
- **Success criteria:** zero diff — the generator reproduces the current state exactly

### Phase 2: Validate and Switch

- Remove `scripts/check-claude-lib-drift.sh` (superseded)
- Add CI workflow running the generator and checking for drift
- Update `CLAUDE.md` to document the new workflow: "edit in `src/`, run `node scripts/generate.js`, commit both source and output"

### Phase 3: Ongoing Workflow

```
1. Edit src/agents/code-reviewer.md
2. Run: node scripts/generate.js
3. Review changes in agents/code_reviewer.md and claude/agents/code-reviewer.md
4. Commit both src/ and generated output together
5. CI verifies generated output matches source
```

### Generated Files in Git

Generated output stays committed. Runtimes need files at their expected paths to function — Gemini reads from root, Claude reads from `claude/`. The `src/` directory is only used at development time, not at runtime.
