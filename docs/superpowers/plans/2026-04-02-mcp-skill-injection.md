# MCP Skill Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `read_file` → `run_shell_command cat` skill access chain with a `get_skill_content` MCP tool and add server-side agent-capability enforcement to `validate_plan`.

**Architecture:** New MCP handler (`get_skill_content`) reads skill/protocol/template/reference files from the extension directory via `fs.readFileSync` — no sandbox restrictions apply. Agent capability tiers are added to the shared agent-registry and enforced by `validate_plan`. The orchestrate command is updated to use the new tool instead of the broken fallback chain.

**Tech Stack:** Node.js (CommonJS), TOML (command prompts), Markdown (skills/templates)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `lib/core/agent-registry.js` | Add `AGENT_CAPABILITIES` map + `getAgentCapability()` + `canCreateFiles()` |
| Create | `lib/mcp/handlers/get-skill-content.js` | New handler: `RESOURCE_ALLOWLIST`, path resolution, batch file reading |
| Modify | `lib/mcp/handlers/validate-plan.js` | Add `agent_capability_mismatch` rule + `CREATION_SIGNAL_PATTERNS` |
| Modify | `mcp/maestro-server.js` | Register `get_skill_content` tool, wire handler |
| Modify | `commands/maestro/orchestrate.toml` | Replace all `read_file`/`cat` fallback chains with `get_skill_content` calls |
| Modify | `GEMINI.md` | Update Maestro Orchestrate section to match orchestrate.toml changes |

---

### Task 1: Add agent capability tiers to agent-registry

**Files:**
- Modify: `lib/core/agent-registry.js`

- [ ] **Step 1: Add AGENT_CAPABILITIES map**

Add after the `KNOWN_AGENTS` array in `lib/core/agent-registry.js`:

```js
const AGENT_CAPABILITIES = Object.freeze({
  architect: 'read_only',
  api_designer: 'read_only',
  code_reviewer: 'read_only',
  content_strategist: 'read_only',
  compliance_reviewer: 'read_only',
  debugger: 'read_shell',
  performance_engineer: 'read_shell',
  security_engineer: 'read_shell',
  seo_specialist: 'read_shell',
  accessibility_specialist: 'read_shell',
  technical_writer: 'read_write',
  product_manager: 'read_write',
  ux_designer: 'read_write',
  copywriter: 'read_write',
  coder: 'full',
  data_engineer: 'full',
  devops_engineer: 'full',
  tester: 'full',
  refactor: 'full',
  design_system_engineer: 'full',
  i18n_specialist: 'full',
  analytics_engineer: 'full',
});
```

- [ ] **Step 2: Add accessor functions**

Add after the `AGENT_CAPABILITIES` constant:

```js
function getAgentCapability(name) {
  const normalized = normalizeAgentName(name);
  return AGENT_CAPABILITIES[normalized] || null;
}

function canCreateFiles(name) {
  const cap = getAgentCapability(name);
  return cap === 'read_write' || cap === 'full';
}
```

- [ ] **Step 3: Update module.exports**

Change the existing `module.exports` line from:

```js
module.exports = { KNOWN_AGENTS, normalizeAgentName, detectAgentFromPrompt };
```

to:

```js
module.exports = { KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability, canCreateFiles };
```

- [ ] **Step 4: Verify the module loads**

Run: `node -e "const r = require('./lib/core/agent-registry'); console.log(r.getAgentCapability('architect'), r.canCreateFiles('architect'), r.canCreateFiles('coder'))"`

Expected: `read_only false true`

- [ ] **Step 5: Commit**

```bash
git add lib/core/agent-registry.js
git commit -m "feat(agent-registry): add AGENT_CAPABILITIES tier map and accessor functions"
```

---

### Task 2: Create get-skill-content MCP handler

**Files:**
- Create: `lib/mcp/handlers/get-skill-content.js`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p lib/mcp/handlers
```

- [ ] **Step 2: Write the handler**

Create `lib/mcp/handlers/get-skill-content.js`:

```js
'use strict';

const fs = require('fs');
const path = require('path');

const RESOURCE_ALLOWLIST = Object.freeze({
  'delegation':               'skills/delegation/SKILL.md',
  'execution':                'skills/execution/SKILL.md',
  'validation':               'skills/validation/SKILL.md',
  'session-management':       'skills/session-management/SKILL.md',
  'implementation-planning':  'skills/implementation-planning/SKILL.md',
  'code-review':              'skills/code-review/SKILL.md',
  'design-dialogue':          'skills/design-dialogue/SKILL.md',
  'agent-base-protocol':      'skills/delegation/protocols/agent-base-protocol.md',
  'filesystem-safety-protocol': 'skills/delegation/protocols/filesystem-safety-protocol.md',
  'design-document':          'templates/design-document.md',
  'implementation-plan':      'templates/implementation-plan.md',
  'session-state':            'templates/session-state.md',
  'architecture':             'references/architecture.md',
});

function resolveExtensionRoot() {
  if (process.env.MAESTRO_EXTENSION_PATH) {
    return process.env.MAESTRO_EXTENSION_PATH;
  }
  const serverFile = process.argv[1];
  if (serverFile) {
    return path.resolve(path.dirname(serverFile), '..');
  }
  return process.cwd();
}

function handleGetSkillContent(params) {
  const resources = params.resources;
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error('resources must be a non-empty array of resource identifiers');
  }

  const extensionRoot = resolveExtensionRoot();
  const contents = {};
  const errors = {};

  for (const id of resources) {
    const relativePath = RESOURCE_ALLOWLIST[id];
    if (!relativePath) {
      errors[id] = `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`;
      continue;
    }

    const absolutePath = path.join(extensionRoot, relativePath);
    try {
      contents[id] = fs.readFileSync(absolutePath, 'utf8');
    } catch (err) {
      errors[id] = `Failed to read ${relativePath}: ${err.message}`;
    }
  }

  return { contents, errors };
}

module.exports = { handleGetSkillContent, RESOURCE_ALLOWLIST };
```

- [ ] **Step 3: Verify the handler loads and reads a file**

Run from the extension root: `MAESTRO_EXTENSION_PATH=$(pwd) node -e "const h = require('./lib/mcp/handlers/get-skill-content'); const r = h.handleGetSkillContent({resources: ['architecture']}); console.log(Object.keys(r.contents), Object.keys(r.errors))"`

Expected: `[ 'architecture' ] []`

- [ ] **Step 4: Verify unknown identifier produces error**

Run from the extension root: `MAESTRO_EXTENSION_PATH=$(pwd) node -e "const h = require('./lib/mcp/handlers/get-skill-content'); const r = h.handleGetSkillContent({resources: ['nonexistent']}); console.log(r.errors['nonexistent'].substring(0, 30))"`

Expected: `Unknown resource identifier: "n`

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/handlers/get-skill-content.js
git commit -m "feat(mcp): add get_skill_content handler — reads extension resources by identifier"
```

---

### Task 3: Add agent-capability validation to validate-plan

**Files:**
- Modify: `mcp/maestro-server.js` (bundled `validate-plan.js` section)

The validate-plan handler is bundled inside `mcp/maestro-server.js` at the `plugins/maestro/src/mcp/handlers/validate-plan.js` section (line ~34332). Since the MCP server is a single bundle, modifications go directly into the bundle.

- [ ] **Step 1: Update the bundled agent-registry section**

**This step must be done BEFORE Step 2.** Both steps edit the same bundle — the registry must export the new functions before the validate-plan section can import them.

In `mcp/maestro-server.js`, find the bundled agent-registry section (starts at the line `// plugins/maestro/src/lib/core/agent-registry.js`, line ~34267). This section contains `KNOWN_AGENTS`, `normalizeAgentName`, and `detectAgentFromPrompt`.

Add `AGENT_CAPABILITIES`, `getAgentCapability`, and `canCreateFiles` matching the code from Task 1 Steps 1-2, and update the `module2.exports` line to:

```js
module2.exports = { KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability, canCreateFiles };
```

- [ ] **Step 2: Add capability imports to the validate-plan section**

In the same file, find the validate-plan section (starts at the line `// plugins/maestro/src/mcp/handlers/validate-plan.js`). The section currently has:

```js
var { KNOWN_AGENTS, normalizeAgentName } = require_agent_registry();
```

Change to:

```js
var { KNOWN_AGENTS, normalizeAgentName, getAgentCapability, canCreateFiles } = require_agent_registry();
```

- [ ] **Step 3: Add CREATION_SIGNAL_PATTERNS constant**

In the validate-plan section, after the `PHASE_LIMITS` line, add:

```js
var CREATION_SIGNAL_PATTERNS = /\b(implement|create|build|scaffold|write|generate|set\s*up|develop)\b/i;
```

- [ ] **Step 4: Add the agent-capability check to handleValidatePlan2**

In `handleValidatePlan2`, after the unknown-agent check loop (the `for (const phase of phases)` loop that checks `!KNOWN_AGENTS.includes(normalized)`), add:

```js
    for (const phase of phases) {
      const normalized = normalizeAgentName(phase.agent);
      if (!normalized) continue;
      const hasFileCreation = (Array.isArray(phase.files_created) && phase.files_created.length > 0)
        || (Array.isArray(phase.files_modified) && phase.files_modified.length > 0);
      if (hasFileCreation && !canCreateFiles(normalized)) {
        const cap = getAgentCapability(normalized);
        violations.push({
          rule: "agent_capability_mismatch",
          detail: `Phase ${phase.id}: agent '${phase.agent}' (${cap}) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.`,
          severity: "error"
        });
      } else if (!hasFileCreation && getAgentCapability(normalized) === 'read_only' && phase.name && CREATION_SIGNAL_PATTERNS.test(phase.name)) {
        violations.push({
          rule: "agent_capability_mismatch",
          detail: `Phase ${phase.id}: agent '${phase.agent}' (read_only) assigned to phase '${phase.name}' which may require file creation. Verify this agent can deliver the phase's requirements.`,
          severity: "warning"
        });
      }
    }
```

- [ ] **Step 5: Verify the capability check catches mismatches**

Run: `node -e "
const fs = require('fs');
// Quick integration test via the bundled handler
delete require.cache[require.resolve('./mcp/maestro-server.js')];
// We can't easily call the bundled handler directly, so test the lib version
const { canCreateFiles } = require('./lib/core/agent-registry');
console.log('architect can create:', canCreateFiles('architect'));
console.log('coder can create:', canCreateFiles('coder'));
"`

Expected:
```
architect can create: false
coder can create: true
```

- [ ] **Step 6: Commit**

```bash
git add mcp/maestro-server.js
git commit -m "feat(validate-plan): add agent-capability mismatch detection for read-only agents"
```

---

### Task 4: Register get_skill_content in MCP server

**Files:**
- Modify: `mcp/maestro-server.js`

- [ ] **Step 1: Add the get-skill-content handler as a bundled section**

In `mcp/maestro-server.js`, before the main entry point comment (`// plugins/maestro/src/mcp/maestro-server.js`, line ~37615), add a new bundled section:

```js
// plugins/maestro/src/mcp/handlers/get-skill-content.js
var require_get_skill_content = __commonJS({
  "plugins/maestro/src/mcp/handlers/get-skill-content.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var RESOURCE_ALLOWLIST2 = Object.freeze({
      "delegation": "skills/delegation/SKILL.md",
      "execution": "skills/execution/SKILL.md",
      "validation": "skills/validation/SKILL.md",
      "session-management": "skills/session-management/SKILL.md",
      "implementation-planning": "skills/implementation-planning/SKILL.md",
      "code-review": "skills/code-review/SKILL.md",
      "design-dialogue": "skills/design-dialogue/SKILL.md",
      "agent-base-protocol": "skills/delegation/protocols/agent-base-protocol.md",
      "filesystem-safety-protocol": "skills/delegation/protocols/filesystem-safety-protocol.md",
      "design-document": "templates/design-document.md",
      "implementation-plan": "templates/implementation-plan.md",
      "session-state": "templates/session-state.md",
      "architecture": "references/architecture.md"
    });
    function resolveExtensionRoot2() {
      if (process.env.MAESTRO_EXTENSION_PATH) {
        return process.env.MAESTRO_EXTENSION_PATH;
      }
      var serverFile = process.argv[1];
      if (serverFile) {
        return path2.resolve(path2.dirname(serverFile), "..");
      }
      return process.cwd();
    }
    function handleGetSkillContent2(params) {
      var resources = params.resources;
      if (!Array.isArray(resources) || resources.length === 0) {
        throw new Error("resources must be a non-empty array of resource identifiers");
      }
      var extensionRoot = resolveExtensionRoot2();
      var contents = {};
      var errors = {};
      for (var i = 0; i < resources.length; i++) {
        var id = resources[i];
        var relativePath = RESOURCE_ALLOWLIST2[id];
        if (!relativePath) {
          errors[id] = 'Unknown resource identifier: "' + id + '". Known identifiers: ' + Object.keys(RESOURCE_ALLOWLIST2).join(", ");
          continue;
        }
        var absolutePath = path2.join(extensionRoot, relativePath);
        try {
          contents[id] = fs2.readFileSync(absolutePath, "utf8");
        } catch (err) {
          errors[id] = "Failed to read " + relativePath + ": " + err.message;
        }
      }
      return { contents: contents, errors: errors };
    }
    module2.exports = { handleGetSkillContent: handleGetSkillContent2, RESOURCE_ALLOWLIST: RESOURCE_ALLOWLIST2 };
  }
});
```

- [ ] **Step 2: Add the registerTool call**

In the main entry point section, after the `resolve_settings` registerTool block (the last registerTool call before `async function main()`), add:

```js
var { handleGetSkillContent } = require_get_skill_content();
registerTool({
  name: "get_skill_content",
  description: "Read one or more Maestro skill files, delegation protocols, templates, or reference documents by identifier. Returns file contents keyed by identifier. Use this instead of read_file for extension-internal resources.",
  inputSchema: {
    type: "object",
    properties: {
      resources: {
        type: "array",
        items: { type: "string" },
        description: 'Resource identifiers to read. Skills: "delegation", "execution", "validation", "session-management", "implementation-planning", "code-review", "design-dialogue". Protocols: "agent-base-protocol", "filesystem-safety-protocol". Templates: "design-document", "implementation-plan", "session-state". References: "architecture".'
      }
    },
    required: ["resources"]
  }
}, handleGetSkillContent);
```

- [ ] **Step 3: Verify the tool is registered**

Run: `node -e "
process.env.MAESTRO_WORKSPACE_PATH = process.cwd();
const m = require('./mcp/maestro-server.js');
" 2>&1 | head -3`

Expected: Server starts without errors (output shows MCP server log lines or exits cleanly).

- [ ] **Step 4: Commit**

```bash
git add mcp/maestro-server.js
git commit -m "feat(mcp): register get_skill_content tool — exposes extension resources to model"
```

---

### Task 5: Update orchestrate command — replace fallback chains

**Files:**
- Modify: `commands/maestro/orchestrate.toml`

- [ ] **Step 1: Replace the startup template/reference reads**

In `commands/maestro/orchestrate.toml`, find the line (line ~130):

```
Read `${extensionPath}/references/architecture.md`, `${extensionPath}/templates/design-document.md`, `${extensionPath}/templates/implementation-plan.md`, and `${extensionPath}/templates/session-state.md` before starting.
```

Replace with:

```
Call `get_skill_content` with resources: ["architecture", "design-document", "implementation-plan", "session-state"] and read the returned content before starting.
```

- [ ] **Step 2: Replace step 10 (implementation-planning)**

Find the line (line ~22):

```
10. Read `${extensionPath}/skills/implementation-planning/SKILL.md` using `read_file` and follow its protocol for Phase 2 (planning). Before presenting the plan, verify each phase's agent can deliver its requirements — read-only agents (architect, api_designer, code_reviewer, content_strategist, compliance_reviewer) cannot be assigned to phases that create files. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/implementation-planning/SKILL.md` as fallback.
```

Replace with:

```
10. Call `get_skill_content` with resources: ["implementation-planning"] and follow the returned protocol for Phase 2 (planning).
```

- [ ] **Step 3: Replace step 11 (add validate_plan instruction)**

Find the line (line ~23):

```
11. Present plan for user approval
```

Replace with:

```
11. Before presenting the plan, call `validate_plan` with the generated plan and task_complexity. If violations with severity "error" are returned, fix them before presenting. Then present the plan for user approval.
```

- [ ] **Step 4: Replace step 12 (session-management)**

Find the line (line ~24):

```
12. Read `${extensionPath}/skills/session-management/SKILL.md` using `read_file` and follow its session creation protocol. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/session-management/SKILL.md` as fallback.
```

Replace with:

```
12. Call `get_skill_content` with resources: ["session-management"] and follow the returned session creation protocol.
```

- [ ] **Step 5: Replace step 13 (execution)**

Find the line (line ~25):

```
13. Read `${extensionPath}/skills/execution/SKILL.md` using `read_file` and resolve the execution mode gate (parallel vs sequential) before creating the session. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/execution/SKILL.md` as fallback.
```

Replace with:

```
13. Call `get_skill_content` with resources: ["execution"] and resolve the execution mode gate (parallel vs sequential) before creating the session.
```

- [ ] **Step 6: Replace step 15 (delegation + validation)**

Find the line (line ~27):

```
15. Read `${extensionPath}/skills/delegation/SKILL.md` using `read_file`. Read `${extensionPath}/skills/validation/SKILL.md` using `read_file`. Execute phases according to the resolved mode, delegating to subagents with validation after each phase. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat` on the same paths as fallback.
```

Replace with:

```
15. Call `get_skill_content` with resources: ["delegation", "validation", "agent-base-protocol", "filesystem-safety-protocol"]. Execute phases according to the resolved mode, delegating to subagents with validation after each phase.
```

- [ ] **Step 7: Replace step 17 (code-review)**

Find the line (line ~29):

```
17. Before completion/archival, read `${extensionPath}/skills/code-review/SKILL.md` using `read_file` and run a final `code_reviewer` quality gate if execution changed non-documentation files; block completion on unresolved Critical/Major findings. If `read_file` fails, use `run_shell_command` with `cat` fallback.
```

Replace with:

```
17. Before completion/archival, call `get_skill_content` with resources: ["code-review"] and run a final `code_reviewer` quality gate if execution changed non-documentation files; block completion on unresolved Critical/Major findings.
```

- [ ] **Step 8: Update the Execution Mode Gate section**

Find the lines (lines ~292-297):

```
Resolve execution mode immediately after the implementation plan is approved.
Activate the `execution` skill and follow its Execution Mode Gate section.
The skill contains the authoritative gate protocol including plan analysis,
recommendation logic, user prompting, and session state recording.

Do not duplicate the gate logic here — the execution skill is the single source of truth.
```

Replace with:

```
Resolve execution mode immediately after the implementation plan is approved.
Call `get_skill_content` with resources: ["execution"] and follow the returned Execution Mode Gate section.
The skill contains the authoritative gate protocol including plan analysis,
recommendation logic, user prompting, and session state recording.

Do not duplicate the gate logic here — the execution skill is the single source of truth.
```

- [ ] **Step 9: Verify no read_file/run_shell_command cat references remain for skills**

Run: `grep -c 'read_file\|run_shell_command.*cat.*extensionPath\|read_file.*fails' commands/maestro/orchestrate.toml`

Expected: `0`

- [ ] **Step 10: Commit**

```bash
git add commands/maestro/orchestrate.toml
git commit -m "refactor(orchestrate): replace read_file/cat fallback chains with get_skill_content"
```

---

### Task 6: Update GEMINI.md — mirror orchestrate.toml changes

**Files:**
- Modify: `GEMINI.md`

The `GEMINI.md` file contains the same skill-reading instructions as the orchestrate command. These must be updated to match.

- [ ] **Step 1: Replace all read_file/cat fallback patterns in GEMINI.md**

Search `GEMINI.md` for every occurrence of the pattern `Read \`\${extensionPath}/skills/...` or `read_file` with the `run_shell_command` `cat` fallback. Replace each with the corresponding `get_skill_content` call, using the same replacement text as Task 5.

The GEMINI.md sections to update mirror the orchestrate command steps:
- Startup: template/reference reads
- Phase 2 (Planning): implementation-planning skill read
- Phase 3 (Execute): execution, delegation, validation skill reads
- Phase 4 (Complete): code-review skill read
- **Express Workflow delegation** (line ~196): protocol injection reads for `agent-base-protocol.md` and `filesystem-safety-protocol.md` — replace `read_file`/`run_shell_command cat` with `get_skill_content` with resources: `["agent-base-protocol", "filesystem-safety-protocol"]`. Remove the "Do not skip protocol injection if the read fails" instruction since `get_skill_content` is always available via MCP.

- [ ] **Step 2: Verify no broken fallback patterns remain**

Run: `grep -c 'read_file.*fails\|run_shell_command.*cat.*extensionPath' GEMINI.md`

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add GEMINI.md
git commit -m "refactor(gemini): replace read_file/cat fallback chains with get_skill_content in orchestrator"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Verify MCP server starts and lists the new tool**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | MAESTRO_WORKSPACE_PATH=$(pwd) node mcp/maestro-server.js 2>/dev/null | grep get_skill_content`

Expected: Output contains `"name":"get_skill_content"` in the tool list.

- [ ] **Step 2: Verify get_skill_content reads a skill file**

Run: `echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_skill_content","arguments":{"resources":["architecture"]}}}' | MAESTRO_WORKSPACE_PATH=$(pwd) node mcp/maestro-server.js 2>/dev/null | grep -o '"contents":{[^}]*'`

Expected: Output contains `"contents":{"architecture":"# Maestro Architecture` (the start of the architecture.md content).

- [ ] **Step 3: Verify validate_plan rejects architect on file-creating phase**

Run: `echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"validate_plan","arguments":{"task_complexity":"medium","plan":{"phases":[{"id":1,"name":"Scaffolding","agent":"architect","blocked_by":[],"parallel":false,"files_created":["data/test.json"],"files_modified":[]}]}}}}' | MAESTRO_WORKSPACE_PATH=$(pwd) node mcp/maestro-server.js 2>/dev/null | grep agent_capability_mismatch`

Expected: Output contains `"rule":"agent_capability_mismatch"` with severity `"error"`.

- [ ] **Step 4: Verify validate_plan warns on ambiguous name signals**

Run: `echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"validate_plan","arguments":{"task_complexity":"medium","plan":{"phases":[{"id":1,"name":"Build Data Layer","agent":"architect","blocked_by":[],"parallel":false}]}}}}' | MAESTRO_WORKSPACE_PATH=$(pwd) node mcp/maestro-server.js 2>/dev/null | grep agent_capability_mismatch`

Expected: Output contains `"rule":"agent_capability_mismatch"` with severity `"warning"`.

- [ ] **Step 5: Verify no read_file/cat fallback chains remain anywhere**

Run: `grep -rl 'read_file.*fails.*workspace.*sandboxing\|run_shell_command.*cat.*extensionPath' commands/ GEMINI.md`

Expected: No output (no matches).
