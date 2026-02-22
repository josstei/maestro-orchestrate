---
name: delegation
description: Agent delegation best practices for constructing effective subagent prompts with proper scoping
---

# Delegation Skill

Activate this skill when delegating work to subagents during orchestration execution. This skill provides the templates, rules, and patterns for constructing effective delegation prompts that produce consistent, high-quality results.

## Protocol Injection

Before constructing any delegation prompt, inject the shared agent base protocol:

### Injection Steps
1. Read `agent-base-protocol.md` from `skills/delegation/protocols/`
2. Read `filesystem-safety-protocol.md` from `skills/delegation/protocols/`
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

1. Read the agent's base definition frontmatter (`temperature`, `max_turns`, `timeout_mins`)
2. Apply environment variable overrides:
   - `MAESTRO_DEFAULT_TEMPERATURE` → overrides `temperature` for all agents
   - `MAESTRO_MAX_TURNS` → overrides `max_turns` for all agents
   - `MAESTRO_AGENT_TIMEOUT` → overrides `timeout_mins` for all agents
3. **Model selection**:
   - **Sequential delegation**: Model is inherited from the main session. Cannot be overridden per-agent via hooks.
   - **Parallel dispatch**: `MAESTRO_DEFAULT_MODEL` is passed as `-m` flag. `MAESTRO_WRITER_MODEL` overrides for `technical_writer`.
4. Include resolved values in the delegation prompt metadata
5. If the agent appears in `MAESTRO_DISABLED_AGENTS`, do not construct a delegation prompt — report to the orchestrator that the agent is disabled


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

For parallel dispatch, the dispatch script automatically prepends the project root directory to every prompt as a safety net. However, delegation prompts should still use absolute paths — the injected root is a fallback for resilience, not a substitute for explicit path construction.

### Specific Deliverables
Define exactly what the agent should produce. Vague instructions like "implement the feature" lead to inconsistent results. Instead: "Create UserService class with createUser(), getUserById(), and deleteUser() methods implementing the IUserService interface."

### Validation Criteria
Include the exact command(s) to run after completion. The agent should run these and report results. Examples:
- `npm run lint && npm run test`
- `cargo build && cargo test`
- `go vet ./... && go test ./...`
- `python -m pytest tests/`

### Exclusions
Explicitly state what the agent must NOT do:
- Files it must not modify
- Dependencies it must not add
- Patterns it must not introduce
- Scope it must not exceed

## Agent Selection Guide

| Task Domain | Agent | Key Capability |
|-------------|-------|---------------|
| System architecture, component design | architect | Read-only analysis, architecture patterns |
| API contracts, endpoint design | api_designer | Read-only, REST/GraphQL expertise |
| Feature implementation, coding | coder | Full read/write/shell access |
| Code quality assessment | code_reviewer | Read-only, verified findings |
| Database schema, queries, ETL | data_engineer | Full read/write/shell access |
| Bug investigation, root cause | debugger | Read + shell for investigation |
| CI/CD, infrastructure, deployment | devops_engineer | Full read/write/shell access |
| Performance analysis, profiling | performance_engineer | Read + shell for profiling |
| Code restructuring, modernization | refactor | Read/write, no shell |
| Security assessment, vulnerability | security_engineer | Read + shell for scanning |
| Test creation, TDD, coverage | tester | Full read/write/shell access |
| Documentation, READMEs, guides | technical_writer | Read/write, no shell |

## Parallel Delegation

Parallel delegation uses `node ${extensionPath}/scripts/parallel-dispatch.js` to spawn independent `gemini` CLI processes. Instead of invoking subagent tools sequentially, the orchestrator writes prompt files to disk and invokes the dispatch script.

### Prompt File Construction

For each agent in a parallel batch, write a complete prompt file to `<state_dir>/parallel/<batch-id>/prompts/<agent-name>.txt`:

```
[Injected base protocol from `agent-base-protocol.md` and `filesystem-safety-protocol.md` in `skills/delegation/protocols/`]

Task: [One-line description]

Progress: Phase [N] of [M]: [Phase Name] (parallel batch with [other agent names])

Files to modify:
- /absolute/path/to/file1.ext: [Specific change required]

Files to create:
- /absolute/path/to/new-file.ext: [Purpose and key contents]

Context from completed phases:
- Phase [N] ([agent]): [Downstream Context summary]

Your output will be consumed by: [downstream agent name(s)]

Deliverables:
- [Concrete output 1]

Validation: [command to run after completion]

Do NOT:
- Modify any files not listed above
- Ask follow-up questions (you are running non-interactively)
- Create git commits (the orchestrator handles commits after the batch)
```

Each prompt must be **fully self-contained** — the agent runs as an independent `gemini` process with no access to the orchestrator's conversation or session context.

### Agent Name Rules

Prompt filenames must follow these rules:

- Prefer **underscores** over hyphens: `technical_writer.txt`, not `technical-writer.txt` (hyphens are normalized to underscores automatically, but underscores match agent filenames directly)
- The filename (minus `.txt` extension) must match an agent definition filename in `agents/` (after hyphen-to-underscore normalization)
- The dispatch script validates agent names at runtime and rejects unrecognized names with a list of available agents
- This validation catches typos before they waste an API call and a timeout window

### Tool Restriction Enforcement

Maestro enforces tool permissions at two levels:

**Level 1: Native enforcement (primary)**

Tool permissions are enforced natively via the `tools:` array in each agent's YAML frontmatter definition (`agents/<agent-name>.md`). The Gemini CLI restricts each subagent to exactly those tools listed, regardless of what the prompt requests. This works for both sequential and parallel delegation.

**Level 2: Prompt-based enforcement (defense-in-depth)**

Parallel-dispatched agents run with `--approval-mode=yolo` (auto-approve all tool calls). As defense-in-depth alongside native enforcement, every parallel dispatch prompt **must** still include an explicit tool restriction block:

1. Agent Base Protocol (read `agent-base-protocol.md` from `skills/delegation/protocols/`)
2. Filesystem Safety Protocol (read `filesystem-safety-protocol.md` from `skills/delegation/protocols/`)
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
- Do NOT use write_file or replace unless explicitly authorized above
- Do NOT use run_shell_command unless explicitly authorized above
- Do NOT create, modify, or delete files unless authorized above
Violation of these restrictions constitutes a security boundary breach.
```

Populate the tool list by reading the agent's definition file (`agents/<agent-name>.md`) and extracting the `tools` array from the YAML frontmatter.

The file writing rules block template:

```
FILE WRITING RULES (MANDATORY):
Use ONLY `write_file` to create files and `replace` to modify files.
Do NOT use run_shell_command with cat, echo, printf, heredocs, or shell redirection (>, >>) to write file content.
Shell interpretation corrupts YAML, Markdown, and special characters. This rule has NO exceptions.
```

This block reinforces the Agent Base Protocol's File Writing Rule directly in every delegation prompt, ensuring agents see the prohibition even if they skim the injected protocols.

### Dispatch Invocation

```bash
node ${extensionPath}/scripts/parallel-dispatch.js <state_dir>/parallel/<batch-id>
```

The script handles spawning, waiting, timeout enforcement, and result collection. See `${extensionPath}/scripts/parallel-dispatch.js` for the full implementation.

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

The `BeforeAgent` hook (`hooks/before-agent.js`) tracks which agent is currently executing:

- **Parallel dispatch**: `MAESTRO_CURRENT_AGENT` is exported per subprocess by `parallel-dispatch.js`. The hook reads this directly from the environment — no prompt parsing needed.
- **Sequential delegation**: The env var is not set. The hook falls back to regex-based detection, scanning the delegation prompt for patterns like `delegate to <agent>` or `@<agent>`.

The detected agent name is persisted to `/tmp/maestro-hooks/<session-id>/active-agent` and cleared by the `AfterAgent` hook on every allowed response (both successful validation and retry allow-through). On deny (malformed output), the active agent is preserved to enable re-validation on retry.

### Session Context Injection

When an active orchestration session exists, the `BeforeAgent` hook parses `<MAESTRO_STATE_DIR>/state/active-session.md` and injects a compact context line into the agent's turn:

```
Active session: current_phase=3, status=in_progress
```

This gives delegated agents awareness of where they sit in the orchestration workflow without requiring explicit context in every delegation prompt. The injection is automatic and requires no action from the orchestrator.

### Handoff Format Enforcement

The `AfterAgent` hook (`hooks/after-agent.js`) validates that every subagent response contains both required handoff sections:

- `## Task Report` (or `# Task Report`)
- `## Downstream Context` (or `# Downstream Context`)

If either heading is missing:

1. **First failure**: The hook blocks the response and requests a retry with a diagnostic message specifying which section is missing.
2. **Second failure** (`stop_hook_active=true`, mapped to `stopHookActive` in JS): The hook allows the malformed response through to prevent infinite retry loops, logging a warning.

This enforcement is the runtime complement to the Output Handoff Contract defined in the agent-base-protocol. Delegation prompts do not need to re-state the retry mechanism — the hook handles it transparently.

**Exception**: The TechLead/orchestrator agent is excluded from validation. Only delegated subagents are subject to format enforcement.

## Validation Criteria Templates

### For Implementation Agents (coder, data_engineer, devops_engineer)
```
Validation: [build command] && [lint command] && [test command]
```

### For Refactoring Agents (refactor)
```
Validation: [build command] && [test command]
Verify: No behavior changes — all existing tests must still pass
```

### For Test Agents (tester)
```
Validation: [test command]
Verify: All new tests pass, report coverage metrics
```

### For Assessment Agents (architect, api_designer, code_reviewer, debugger, performance_engineer, security_engineer)
```
Validation: N/A (assessment-only — no write tools)
Verify: Findings reference specific files and line numbers
```

### For Documentation Agents (technical_writer)
```
Validation: Verify all links resolve, code examples are syntactically valid
```
