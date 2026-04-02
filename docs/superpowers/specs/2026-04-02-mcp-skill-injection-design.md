# MCP Skill Injection at Phase Boundaries

**Task Complexity:** Medium
**Design Depth:** Deep

## 1. Problem Statement

The Maestro orchestrate command instructs the model to read skill files at 7 runtime points via a two-step fallback chain (`read_file` → `run_shell_command cat`). Both steps are blocked:

- `read_file` is blocked by Gemini CLI's workspace sandbox (extension path is outside the workspace)
- `run_shell_command cat` is blocked by Plan Mode policies (shell execution denied in read-only mode)

Gemini CLI's sandbox is strict by design — no extension-declared mechanism exists to add readable paths. The `read_file` tool validates paths against `WorkspaceContext.isPathReadable()` which only allows workspace directories and registered read-only paths. Extensions cannot modify either. The only escape hatches are:

1. `contextFileName` — loaded at init via `fs.readFile()`, bypasses the tool system (this is how GEMINI.md works)
2. MCP server responses — MCP tools run server-side with full filesystem access; responses aren't path-validated

When both fallback steps fail, the model improvises from memory, causing cascading protocol violations:

1. **Read-only agent assigned to file-creating phase** — the implementation-planning skill's hard gate wasn't available
2. **Design sections presented as one block** — the design-dialogue protocol's per-section validation wasn't reinforced by the skill read
3. **`ask` presented as a user-facing execution option** — the execution skill's gate protocol wasn't available
4. **`validate_plan` MCP tool doesn't enforce agent-capability compatibility** — the server has `KNOWN_AGENTS` but no capability classification

The solution adds a `get_skill_content` MCP tool so the orchestrator can reliably access skill files (the MCP server has unrestricted `fs` access), and extends `validate_plan` to enforce agent-deliverable compatibility server-side.

## 2. Requirements

- Skill files must be accessible to the orchestrator model in all modes (normal, Plan Mode, auto-edit)
- The broken `read_file` → `run_shell_command cat` fallback chain must be fully eliminated
- Agent-capability enforcement must be deterministic and server-side, not prompt-dependent
- Template and reference files must also be accessible via the same mechanism
- The solution must not introduce a general-purpose file reader — only known extension resources
- No changes to Gemini CLI itself — the solution works within the existing extension/MCP contract

## 3. Approach

### MCP Skill Reader — `get_skill_content` Tool

A new MCP tool that reads skill files and delegation protocols from `${extensionPath}`. The MCP server already has unrestricted `fs.readFile` access to its own extension directory — this exposes that capability as a tool.

#### Interface

```
Tool: get_skill_content
Description: Read one or more Maestro skill files, delegation protocols, templates, 
             or reference documents. Returns file contents keyed by identifier.

Input:
  resources: string[]   — Resource identifiers to read (skills, protocols, templates, references)

Output:
  contents: Record<string, string>   — Identifier → file content
  errors: Record<string, string>     — Identifier → error message (for any that failed)
```

#### Resolution Logic

The server resolves identifiers to paths via a hardcoded allowlist:
- Skill names → `${extensionPath}/skills/<name>/SKILL.md`
- Protocol names → `${extensionPath}/skills/delegation/protocols/<name>.md`
- Template names → `${extensionPath}/templates/<name>.md`
- Reference names → `${extensionPath}/references/<name>.md`

Known identifiers:
- Skills: `delegation`, `execution`, `validation`, `session-management`, `implementation-planning`, `code-review`, `design-dialogue`
- Protocols: `agent-base-protocol`, `filesystem-safety-protocol`
- Templates: `design-document`, `implementation-plan`, `session-state`
- References: `architecture`

No arbitrary path access — identifiers are validated against this allowlist. This is not a general file reader.

#### Batching

The tool accepts multiple identifiers in one call so the model can fetch everything it needs for a phase transition in a single round-trip. Example:

```
mcp_maestro_get_skill_content(resources: [
  "delegation", 
  "execution", 
  "validation",
  "agent-base-protocol", 
  "filesystem-safety-protocol"
])
```

This replaces 5 separate `read_file` calls (that would all fail anyway).

### Agent Capability Enforcement in `validate_plan`

#### Agent Capability Registry

Extend `lib/core/agent-registry.js` with a capability tier map:

```
AGENT_CAPABILITIES: Record<string, "read_only" | "read_shell" | "read_write" | "full">

read_only:   architect, api_designer, code_reviewer, content_strategist, compliance_reviewer
read_shell:  debugger, performance_engineer, security_engineer, seo_specialist, accessibility_specialist
read_write:  technical_writer, product_manager, ux_designer, copywriter
full:        coder, data_engineer, devops_engineer, tester, refactor, design_system_engineer, 
             i18n_specialist, analytics_engineer
```

This mirrors the 4-tier tool profile documented in the delegation skill and agent roster. The source of truth moves from prompt text into a data structure the MCP server can enforce.

#### Validation Rule

`validate_plan` adds a new check: for each phase, if the assigned agent's capability is `read_only` or `read_shell`, and the phase has file-creation or file-modification deliverables, emit an error violation:

```json
{
  "rule": "agent_capability_mismatch",
  "detail": "Phase 1: agent 'architect' (read_only) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis (architect) + implementation (coder) phases.",
  "severity": "error"
}
```

#### Inference from Phase Data

The check uses the phase's `files_created` and `files_modified` arrays if provided. If those arrays are empty (common at plan validation time before execution), the tool falls back to checking the phase `name` for creation signals — terms like "implement", "create", "build", "scaffold", "write" paired with a read-only agent trigger a `warning` (not `error`) suggesting the model verify the assignment.

### Orchestrate Command Changes

The orchestrate command's 7 skill-read points are replaced with `get_skill_content` calls:

| Step | Current | New |
|------|---------|-----|
| Startup (templates/refs) | `read_file` on 4 template/reference files | `get_skill_content(["architecture", "design-document", "implementation-plan", "session-state"])` |
| 10 (Planning) | `read_file` impl-planning skill | `get_skill_content(["implementation-planning"])` |
| 12 (Session) | `read_file` session-management skill | `get_skill_content(["session-management"])` |
| 13 (Execution) | `read_file` execution skill | `get_skill_content(["execution"])` |
| 15 (Delegation) | `read_file` delegation + validation skills | `get_skill_content(["delegation", "validation", "agent-base-protocol", "filesystem-safety-protocol"])` |
| 17 (Code review) | `read_file` code-review skill | `get_skill_content(["code-review"])` |

The `read_file` → `run_shell_command cat` fallback chain is removed entirely from the orchestrate command.

The design-dialogue protocol stays inlined — it's needed from the first design turn and is used across multiple turns.

Step 11 (plan presentation) gains a new instruction: call `validate_plan` before presenting the plan to the user, and fix violations before presenting.

## 4. Architecture

### New Components

```
lib/core/agent-registry.js
  + AGENT_CAPABILITIES (frozen map: agent_name → capability tier)
  + getAgentCapability(name) → "read_only" | "read_shell" | "read_write" | "full"
  + canCreateFiles(name) → boolean (true for "read_write" and "full")

mcp/handlers/get-skill-content.js (new)
  + RESOURCE_ALLOWLIST (frozen map: identifier → relative path)
  + handleGetSkillContent(params, extensionPath) → { contents, errors }

mcp/handlers/validate-plan.js
  + agent_capability_mismatch validation rule
  + CREATION_SIGNAL_PATTERNS for phase name inference
```

### Modified Components

```
mcp/maestro-server.js
  + registerTool("get_skill_content", ...) 
  + extensionPath resolution (dirname of server entry point)

commands/maestro/orchestrate.toml
  - Remove all read_file/run_shell_command cat fallback chains for skills
  + Replace with get_skill_content calls
  + Add validate_plan instruction before plan presentation
```

### Unchanged Components

- All 22 agent definition files (`agents/*.md`)
- All 7 skill files (`skills/*/SKILL.md`)
- Both delegation protocol files (`skills/delegation/protocols/*.md`)
- All 3 template files (`templates/*.md`)
- All hook files (`hooks/*`)
- Policy file (`policies/maestro.toml`)
- Extension config (`gemini-extension.json`)
- Session state tools (create, transition, archive, update, get_status)

## 5. Risk Assessment

**Risk: MCP server unavailability blocks all skill access**
- Severity: Low
- The MCP server is required for Maestro's core workflow regardless (session state, complexity assessment, plan validation). If it's down, orchestration already can't proceed. This change doesn't introduce a new failure mode — it consolidates an existing dependency.

**Risk: Stale skill content if MCP server caches reads**
- Severity: Low
- The implementation reads files on every call (`fs.readFileSync`), matching the current MCP handlers' pattern. No cache layer is introduced. Skill content changes take effect immediately.

**Risk: Token cost increase from skill content in MCP responses**
- Severity: Low-Medium
- Skill files range from 4-8KB each. A full batch read (delegation + validation + both protocols) adds ~20KB of content in one response. However, this replaces content the model was already supposed to consume — it just never could. The net token impact is the difference between "model improvises from memory" (0KB, broken behavior) and "model follows authoritative instructions" (4-20KB per phase boundary, correct behavior). This is a cost of correctness, not overhead.

**Risk: `validate_plan` rejects plans that previously passed**
- Severity: Medium
- Adding agent-capability enforcement means existing plan patterns (like assigning `architect` to file-creating phases) will now be rejected. This is the intended behavior — these plans were wrong and worked only by accident (Gemini CLI dispatches via the `coder` tool regardless of the `Agent:` header). The model will need to adjust by assigning write-capable agents or splitting phases.
- Mitigation: The check on phase name signals (when `files_created`/`files_modified` are empty) uses `warning` severity, not `error`. Only explicit file lists trigger hard rejection.

**Risk: Identifier allowlist becomes a maintenance burden**
- Severity: Low
- New skills or protocols require adding an entry to the allowlist. This is deliberate friction — it prevents the tool from becoming a general file reader. The allowlist lives in a single constant alongside `KNOWN_AGENTS`, following the same maintenance pattern.

## 6. Success Criteria

1. **Skill reads never fail due to sandbox or Plan Mode** — `get_skill_content` returns content in all modes (normal, Plan Mode, auto-edit). Verified by calling it while in Plan Mode during a Standard workflow design phase.

2. **No `read_file` or `run_shell_command cat` references remain in the orchestrate command for skill/template/reference reads** — the broken fallback chain is fully eliminated. The only file-reading instructions that remain are for user workspace files (e.g., `buddy.txt`), not extension-internal files.

3. **`validate_plan` rejects read-only agents assigned to file-creating phases** — calling `validate_plan` with `architect` on a phase that has `files_created: ["data/companions.json"]` returns an `agent_capability_mismatch` error violation.

4. **`validate_plan` warns on ambiguous assignments** — calling `validate_plan` with `architect` on a phase named "Project Scaffolding & Data Layer" with empty file lists returns a warning (not error) suggesting verification.

5. **Execution mode gate presents only `parallel` and `sequential` to users** — with the execution skill now readable, the model follows the authoritative protocol instead of improvising `ask` as a user-facing option. Verified by replaying the test scenario.

6. **Design section-by-section validation resumes** — with the design-dialogue protocol (already inlined) reinforced by the model having the complete Standard workflow context from skill reads, the model presents sections individually with `ask_user type: 'yesno'` approval gates.

7. **End-to-end regression: Bristlebomb test scenario produces zero protocol violations** — replay the same task with the same user choices. The session should complete with correct agent assignments, proper approval gates at each section, and `parallel`/`sequential` as the only execution mode options.
