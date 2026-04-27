---
name: delegation
description: Agent delegation best practices for constructing effective subagent prompts with proper scoping
---

# Delegation Skill

Activate this skill when delegating work to subagents during orchestration execution. This skill provides the templates, rules, and patterns for constructing effective delegation prompts that produce consistent, high-quality results.

## Protocol Injection

Before constructing any delegation prompt, inject the shared agent base protocol:

### Injection Steps
1. Load `agent-base-protocol` via `get_skill_content`
2. Load `filesystem-safety-protocol` via `get_skill_content`
3. Prepend both protocols to the delegation prompt (base protocol first, then filesystem safety) — these appear before the task-specific content
4. For each phase listed in the current phase's `blocked_by`, read `phases[].downstream_context` from session state and include it in the prompt
5. If any required `downstream_context` is missing, include an explicit placeholder noting the missing dependency context (never omit silently)

The injected protocol ensures every agent follows consistent pre-work procedures and output formatting regardless of their specialization.

### Context Chain Construction

Every delegation prompt must include a context chain that connects the current phase to prior work:

**Phase Context**: Include Downstream Context blocks from all completed phases that the current phase depends on (identified via `blocked_by` relationships in the implementation plan and sourced from session state `phases[].downstream_context`):
```
Context from completed phases:
- Phase [N] ([agent]): [Downstream Context summary]
  - Interfaces introduced: [list with file locations]
  - Patterns established: [list]
  - Integration points: [specific files, functions, endpoints]
  - Warnings: [list]
```

**Accumulated Patterns**: Naming conventions, directory organization patterns, and architectural decisions established by earlier phases. This ensures phase 5 does not contradict patterns set in phase 2.

**File Manifest**: Complete list of files created or modified in prior phases, so the agent knows what already exists and can import from or extend those files.

**Missing Context Fallback**: If a blocked dependency has no stored downstream context, include a visible placeholder entry in the prompt:
`- Phase [N] ([agent]): Downstream Context missing in session state — verify dependency output before implementation`

### Downstream Consumer Declaration

Every delegation prompt must declare who will consume the agent's output:
```
Your output will be consumed by: [downstream agent name(s)] who need [specific information they require]
```

This primes the agent to structure their Downstream Context section for maximum utility to the next agent in the chain.

## Settings Override Application

Before constructing any delegation prompt, resolve configurable parameters:

1. Read the agent's base definition frontmatter (`temperature`, `max_turns`, `timeout_mins`, `tools`)
2. Do not invent Maestro-level model, temperature, turn, or timeout overrides. Native delegation uses agent frontmatter defaults plus any runtime-level agent configuration already active in the session.
3. Include only task-relevant execution context in the prompt metadata
4. If the agent appears in `MAESTRO_DISABLED_AGENTS`, do not construct a delegation prompt — report to the orchestrator that the agent is disabled

## Delegation Prompt Template

Every delegation to a subagent must follow this structure:

```
Task: [One-line description of what to accomplish]

Progress: Phase [N] of [M]: [Phase Name]

Files to modify:
- /absolute/path/to/file1.ext: [Specific change required]
- /absolute/path/to/file2.ext: [Specific change required]

Files to create:
- /absolute/path/to/new-file.ext: [Purpose and key contents]

Deliverables:
- [Concrete output 1]
- [Concrete output 2]

Validation: [command to run after completion, e.g., "npm run lint && npm run test"]

Context:
[Relevant information from the design document or previous phases]

Do NOT:
- [Explicit exclusion 1]
- [Explicit exclusion 2]
- Modify any files not listed above
```

## Scope Boundary Rules

### Absolute Paths
Always provide absolute file paths in delegation prompts. Never use relative paths or expect agents to search for files.

### Specific Deliverables
Define exactly what the agent should produce. Vague instructions like "implement the feature" lead to inconsistent results. Instead: "Create UserService class with createUser(), getUserById(), and deleteUser() methods implementing the IUserService interface."

### Validation Criteria
Include the exact command(s) to run after completion. The agent should run these and report results. Examples:
- `npm run lint && npm run test`
- `cargo build && cargo test`
- `go vet ./... && go test ./...`
- `python -m pytest tests/`

### No Interactive Commands in Delegation Prompts
Never include interactive CLI commands in delegation prompts. Subagents run autonomously without user input. Interactive commands will hang indefinitely.

<ANTI-PATTERN>
WRONG — Delegation prompt includes interactive scaffolding:
  "Run `npx create-next-app@latest . --typescript --tailwind`"
  "Run `npm init` to create package.json"

CORRECT — Delegation prompt specifies direct file creation:
  "Create package.json with the following content: ..."
  "Create tsconfig.json, tailwind.config.ts, and src/app/layout.tsx directly"
</ANTI-PATTERN>

### Exclusions
Explicitly state what the agent must NOT do:
- Files it must not modify
- Dependencies it must not add
- Patterns it must not introduce
- Scope it must not exceed

## Agent Selection Guide

| Task Domain | Agent | Key Capability |
|-------------|-------|---------------|
| System architecture, component design | `architect` | Read-only analysis, architecture patterns |
| API contracts, endpoint design | `api-designer` | Read-only, REST/GraphQL expertise |
| Feature implementation, coding | `coder` | Full read/write/shell access |
| Code quality assessment | `code-reviewer` | Read-only, verified findings |
| Database schema, queries, ETL | `data-engineer` | Full read/write/shell access |
| Bug investigation, root cause | `debugger` | Read + shell for investigation |
| CI/CD, infrastructure, deployment | `devops-engineer` | Full read/write/shell access |
| Performance analysis, profiling | `performance-engineer` | Read + shell for profiling |
| Code restructuring, modernization | `refactor` | Read/write/shell, skill activation |
| Security assessment, vulnerability | `security-engineer` | Read + shell for scanning |
| Test creation, TDD, coverage | `tester` | Full read/write/shell access |
| Documentation, READMEs, guides | `technical-writer` | Read/write, no shell |
| Technical SEO auditing | `seo-specialist` | Read + shell + web search/fetch |
| Marketing copy, content writing | `copywriter` | Read/write |
| Content planning, strategy | `content-strategist` | Read + web search/fetch |
| User experience design | `ux-designer` | Read/write + web search |
| WCAG compliance auditing | `accessibility-specialist` | Read + shell + web search |
| Requirements, product strategy | `product-manager` | Read/write + web search |
| Tracking, measurement | `analytics-engineer` | Full read/write/shell access |
| Internationalization | `i18n-specialist` | Full read/write/shell access |
| Design tokens, theming | `design-system-engineer` | Full read/write/shell access |
| Legal, regulatory compliance | `compliance-reviewer` | Read + web search/fetch |

## Agent Tool Dispatch Contract

Delegate to the assigned agent using the dispatch pattern from `get_runtime_context` (loaded at session start, step 0). Every Maestro agent in the Agent Roster carries its frontmatter configuration:

- `temperature`: Controls output determinism (e.g., coder uses 0.2 for precise code)
- `max_turns`: Prevents runaway sessions (e.g., 25 turns for implementation agents)
- `tools`: Restricts the agent to its authorized tool surface (e.g., read-only agents cannot use file-writing tools)
- Body: Contains the agent's specialized methodology and decision frameworks

Using a generic/default agent tool bypasses all of this — it uses default temperature, has no turn limit, no tool restrictions, and no specialized methodology. Never use a generic agent tool for Maestro phase delegations.

Every delegation must include the required header fields:

```
Agent: <agent_name>
Phase: <id>/<total>
Batch: <batch_id> (or "single" for sequential)
Session: <session_id>
```

**Sequential dispatch**: Invoke the agent using your runtime's dispatch mechanism with the full delegation prompt.

**Parallel dispatch**: Emit contiguous agent dispatch calls in a single turn for all agents in the ready batch. Each call includes the same header format with the shared batch ID.

Call `get_agent` with the agent name (as it appears in the implementation plan or Agent Roster) to load the agent methodology body, declared tool restrictions, and the runtime-specific `dispatch` descriptor. Use `dispatch.tool_name` as the callable surface and pass the rendered delegation prompt through `dispatch.prompt_param`. When `dispatch.agent_param` is non-null, pass `dispatch.agent_name` through that parameter as well. Runtime-local agent files remain registration stubs only; do not rely on them for the full methodology body.

Examples:
- Brokered runtimes such as Gemini and Qwen return `dispatch.tool_name: "invoke_agent"`, `dispatch.agent_param: "agent_name"`, `dispatch.agent_name: "<snake_case_agent>"`, and `dispatch.prompt_param: "prompt"`.
- Claude returns the native `Agent` surface with `dispatch.agent_param: "subagent_type"` and `dispatch.agent_name: "maestro:<agent>"`.
- Codex returns the native spawn surface; apply the Codex runtime guide's mapping while preserving the Maestro agent name in the prompt header.

The legacy top-level `tool_name` returned by `get_agent` mirrors `dispatch.tool_name` for backward compatibility only. New orchestration code should consume `dispatch`.

## Parallel Delegation

Parallel delegation uses the runtime's native subagent scheduler. The orchestrator emits contiguous agent tool calls inside a single turn; it does not write prompt files, spawn subprocesses, or call shell-based dispatch helpers.

### Native Batch Construction

For each agent in a ready batch:

1. Build a full delegation prompt using the same template as sequential delegation
2. Include the required header:
   - `Agent: <agent_name>`
   - `Phase: <id>/<total>`
   - `Batch: <batch_id>`
   - `Session: <session_id>`
3. Keep prompts self-contained with explicit files, deliverables, validation commands, exclusions, and dependency context
4. Emit only contiguous agent tool calls for the current batch turn — no shell commands, file writes, or narration between them

Native parallel batches may pause if an agent asks a follow-up question. Scope prompts tightly enough that questions are rare.

### Tool Restriction Enforcement

Maestro enforces tool permissions at two levels:

**Level 1: Native enforcement (primary)**

Tool permissions are enforced natively via each agent's registered frontmatter stub. Use the `tools` array returned by `get_agent` when you mirror that restriction in the prompt. This works for both sequential and parallel delegation.

**Level 2: Prompt-based enforcement (defense-in-depth)**

Native tool permissions remain the primary boundary. As defense-in-depth, every delegation prompt should still include an explicit tool restriction block so the agent sees its allowed surface in plain language.

1. Agent Base Protocol (load `agent-base-protocol` via `get_skill_content`)
2. Filesystem Safety Protocol (load `filesystem-safety-protocol` via `get_skill_content`)
3. **TOOL RESTRICTIONS block (immediately here, before any task content)**
4. **FILE WRITING RULES block (immediately after tool restrictions)**
5. Context chain from prior phases
6. Task-specific instructions
7. Scope boundaries and prohibitions

The tool restriction block template:

```
TOOL RESTRICTIONS (MANDATORY):
You are authorized to use ONLY the following tools: [list from agent frontmatter].
Do NOT use any tools not listed above. Specifically:
- Do NOT use `write_file` or `replace` unless explicitly authorized above
- Do NOT use `run_shell_command` unless explicitly authorized above
- Do NOT create, modify, or delete files unless authorized above
Violation of these restrictions constitutes a security boundary breach.
```

Populate the tool list from the `tools` array returned by `get_agent` for the delegated agent.

The file writing rules block template:

```
FILE WRITING RULES (MANDATORY):
Use ONLY `write_file` to create files and `replace` to modify files.
Do NOT use `run_shell_command` with cat, echo, printf, heredocs, or shell redirection (>, >>) to write file content.
Shell interpretation corrupts YAML, Markdown, and special characters. This rule has NO exceptions.
```

This block reinforces the Agent Base Protocol's File Writing Rule directly in every delegation prompt, ensuring agents see the prohibition even if they skim the injected protocols.

### Non-Overlapping File Ownership
When delegating to multiple agents in parallel, ensure no two agents are assigned the same file. Each file must have exactly one owner in a parallel batch.

### Batch Completion Gates
All agents in a parallel batch must complete before:
- The next batch of phases begins
- Shared/container files are updated
- Validation checkpoints run
- The orchestrator creates a git commit for the batch

### Conflict Prevention
- Assign non-overlapping file sets to each agent
- Reserve shared files (barrel exports, configuration, dependency manifests) for a single agent or a post-batch update step
- If two phases must modify the same file, they cannot run in parallel — execute them sequentially
- Parallel agents must NOT create git commits — the orchestrator commits after validating the batch

## Hook Integration

Maestro hooks fire at agent boundaries during delegation, providing context injection and output validation. Understanding hook behavior is essential for constructing correct delegation prompts.

### Agent Tracking

Before each agent dispatch, a hook tracks which agent is currently executing:

- Preferred signal: the required `Agent: <agent_name>` header in the delegation prompt
- Legacy fallbacks: `MAESTRO_CURRENT_AGENT` from the environment, then regex-based detection of patterns like `delegate to <agent>` or `@<agent>`

The detected agent name is persisted to `/tmp/maestro-hooks/<session-id>/active-agent` and cleared by the post-delegation hook on every allowed response (both successful validation and retry allow-through). On deny (malformed output), the active agent is preserved to enable re-validation on retry.

### Session Context Injection

When an active orchestration session exists, the pre-delegation hook parses `<MAESTRO_STATE_DIR>/state/active-session.md` and injects a compact context line into the agent's turn:

```
Active session: current_phase=3, status=in_progress
```

This gives delegated agents awareness of where they sit in the orchestration workflow without requiring explicit context in every delegation prompt. The injection is automatic and requires no action from the orchestrator.

### Handoff Format Enforcement

After completion, the post-delegation hook validates that every subagent response contains both required handoff sections:

- `## Task Report` (or `# Task Report`)
- `## Downstream Context` (or `# Downstream Context`)

If either heading is missing:

1. **First failure**: The hook blocks the response and requests a retry with a diagnostic message specifying which section is missing.
2. **Second failure** (`stop_hook_active=true`, mapped to `stopHookActive` in JS): The hook allows the malformed response through to prevent infinite retry loops, logging a warning.

This enforcement is the runtime complement to the Output Handoff Contract defined in the agent-base-protocol. Delegation prompts do not need to re-state the retry mechanism — the hook handles it transparently.

**Exception**: The TechLead/orchestrator agent is excluded from validation. Only delegated subagents are subject to format enforcement.

## Delegation Constraints (per runtime)

Read `delegation.constraints` from `get_runtime_context` before constructing any agent dispatch. Apply constraints to the dispatch:

- `fork_full_context_incompatible_with`: list of field names. If the runtime is invoking a fork-style delegation with full-history inheritance, do NOT pass any of these fields. For Codex, this means omitting `agent_type`, `model`, and `reasoning_effort` whenever `fork_context: true` or `fork_turns: "all"` is used.
- `result_surface: "synchronous"`: the parent receives the child's full text response in the dispatch return value. Parse the Task Report and Downstream Context directly from that text.
- `result_surface: "deferred"`: the parent receives only identifiers. The parent MUST poll for completion (`wait_agent` or equivalent) with a bounded timeout. On timeout or empty return, invoke the Recovery Protocol in the execution skill.
- `child_cannot_prompt_user: true`: child agents cannot call the user-prompt tool. All user questions must surface through the Blocker Protocol below.

## Blocker Protocol (child-agent question surfacing)

**MANDATORY** when `delegation.constraints.child_cannot_prompt_user` is true (Codex today). **RECOMMENDED** uniformly so the orchestrator remains the single approval point across runtimes.

Every agent's Task Report may include a `## Blockers` section, placed between `## Task Report` and `## Downstream Context`:

    ## Blockers
    - BLOCKER: [question the agent cannot resolve]
      Context: [why this question arose]
      Required to proceed: [what answer unlocks continuation]

When parsing an agent response:

1. If `## Blockers` is present and non-empty, do NOT call `transition_phase`. Keep the phase `in_progress`.
2. Aggregate blockers across the batch (if parallel).
3. Ask the user via the runtime's user-prompt tool.
4. Re-delegate the phase with the answer added to the Context block. The agent re-tries with the new information.
5. On the next return, re-parse and proceed.

An agent that returns neither a handoff nor a blocker is considered incomplete. Invoke the Recovery Protocol in the execution skill.

## Validation Criteria Templates

### For Implementation Agents (`coder`, `data-engineer`, `devops-engineer`)
```
Validation: [build command] && [lint command] && [test command]
```

### For Refactoring Agents (`refactor`)
```
Validation: [build command] && [test command]
Verify: No behavior changes — all existing tests must still pass
```

### For Test Agents (`tester`)
```
Validation: [test command]
Verify: All new tests pass, report coverage metrics
```

### For Assessment Agents (`architect`, `api-designer`, `code-reviewer`, `debugger`, `performance-engineer`, `security-engineer`, `seo-specialist`, `accessibility-specialist`, `content-strategist`, `compliance-reviewer`)
```
Validation: N/A (assessment-only — no write tools)
Verify: Findings reference specific files and line numbers
```

### For Documentation Agents (`technical-writer`, `copywriter`)
```
Validation: Verify all links resolve, code examples are syntactically valid
```

### For Design and Product Agents (`ux-designer`, `product-manager`)
```
Validation: N/A (design and requirements artifacts)
Verify: Deliverables reference user needs and acceptance criteria
```

### For Implementation Specialists (`analytics-engineer`, `i18n-specialist`, `design-system-engineer`)
```
Validation: [build command] && [lint command] && [test command]
Verify: Domain-specific integration validated (tracking fires, locales render, tokens apply)
```
