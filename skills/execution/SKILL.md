---
name: execution
description: Phase execution methodology for orchestration workflows with error handling and completion protocols
---

# Execution Skill

Activate this skill during Phase 3 (Execution) of Maestro orchestration. This skill provides the protocols for executing implementation plan phases through subagent delegation, handling errors, and completing orchestration sessions.

## Execution Mode Gate

Before executing any phases in Phase 3:

1. Read `MAESTRO_EXECUTION_MODE` (default: `ask`)
2. If `ask`: present the execution mode selection prompt defined in `GEMINI.md`
3. Record the user's choice in session state as `execution_mode`
4. If `parallel` or `sequential`: use the pre-selected mode and log it
5. For the remainder of this session, use the selected mode for all batches

**Mode-specific behavior:**
- When parallel is selected and a batch contains only one phase, fall back to sequential for that batch (no benefit from parallel with a single agent)
- When sequential is selected and the plan identifies parallelizable phases, execute them sequentially in dependency order — do not reorder the plan

## State File Access

The `read_file` tool enforces `.gitignore` patterns via `shouldIgnoreFile()`, and `.gemini/` is typically gitignored. All reads of files within `<MAESTRO_STATE_DIR>` must use the shell script to bypass this restriction:

```bash
run_shell_command: ./scripts/read-state.sh <relative-path>
```

Note: `run_shell_command` executes from the workspace root directory (`config.getTargetDir()`), so relative paths like `./scripts/read-state.sh` resolve from the project root.

This applies to:
- Reading `summary.json` from parallel dispatch results
- Reading individual agent `.json` output files
- Reading `active-session.md` for state checks

Use `write_file` directly for state writes — it does not enforce ignore patterns. Never use `read_file` for paths inside `<MAESTRO_STATE_DIR>`.

## Phase Execution Protocol

### Sequential Execution

For phases with dependencies (`blocked_by` is non-empty):

1. Verify all blocking phases have `status: completed`
2. Update the phase status to `in_progress` in session state
3. Update `current_phase` in session state
4. Call `write_todos` to reflect current phase progress before delegating
5. Delegate to the assigned agent(s) with full context
6. Process the agent's Task Report
7. Update session state with results (files changed, validation status, token usage)
8. Transition phase status to `completed` or `failed`
9. Call `write_todos` to mark the phase complete after state update

### Parallel Execution

For phases at the same dependency depth with no file overlap, use shell-based parallel dispatch via `scripts/parallel-dispatch.sh`. This spawns independent `gemini` CLI processes that execute concurrently, bypassing the sequential subagent tool invocation pattern.

#### Parallel Dispatch Protocol

1. Verify all blocking phases for every phase in the batch are completed
2. Update all batch phases to `in_progress` simultaneously in session state
3. Call `write_todos` with a single composite item: "Executing batch: Phase N, M, O" as `in_progress` (only one todo can be `in_progress` at a time — the CLI enforces this constraint)
4. Ensure the batch-specific dispatch directory exists before writing prompt files:
   ```bash
   mkdir -p <state_dir>/parallel/<batch-id>/prompts
   ```
4. Write each agent's full delegation prompt (including injected base protocol, context chain, and downstream consumer declaration) to its prompt file
5. Invoke the parallel dispatch script via `run_shell_command`:
   ```bash
   ./scripts/parallel-dispatch.sh <state_dir>/parallel/<batch-id>
   ```
6. The script spawns one `gemini -p <prompt> --yolo --output-format json` process per prompt file
7. All agents execute concurrently as independent CLI processes
8. The script waits for all agents, collects exit codes, and writes `results/summary.json`
9. Read the batch summary via run_shell_command: `./scripts/read-state.sh <state_dir>/parallel/<batch-id>/results/summary.json`
10. For each agent, read its JSON output via run_shell_command: `./scripts/read-state.sh <state_dir>/parallel/<batch-id>/results/<agent-name>.json` and parse the Task Report
11. Update session state for all phases in the batch
12. Only proceed to the next batch when all phases in the current batch are completed

#### Parallel Dispatch Constraints

- Each agent runs as an **independent `gemini` process** — no shared memory or conversation context between parallel agents
- Agents inherit the project directory and linked extensions, but do NOT share the orchestrator's session
- The orchestrator must write complete, self-contained prompts — parallel agents cannot ask follow-up questions
- File ownership must be strictly non-overlapping — the dispatch script provides no file locking
- `MAESTRO_DEFAULT_MODEL` and `MAESTRO_AGENT_TIMEOUT` environment variables are respected by the dispatch script
- If any agent in the batch fails, the summary reports `partial_failure` — the orchestrator decides whether to retry or escalate

#### Fallback to Sequential

If parallel dispatch fails (script not found, `gemini` CLI not available in PATH, or all agents fail), fall back to sequential execution via direct subagent tool invocation and record the fallback in session state.

### Progress Context

Include the following in every delegation prompt to maintain execution awareness:

```
Progress: Phase [N] of [M]: [Phase Name]
Session: [session_id]
```

## Error Handling Protocol

### Error Recording

Record all errors in session state with complete metadata:
- `agent`: Which subagent encountered the error
- `timestamp`: When the error occurred (ISO 8601)
- `type`: Category — `validation`, `timeout`, `file_conflict`, `runtime`, `dependency`
- `message`: Full error message or relevant output
- `resolution`: How it was resolved, or `pending` if unresolved

### Retry Logic

- **Maximum retries** per phase: controlled by `MAESTRO_MAX_RETRIES` (default: 2). Escalate to user after this limit is reached.
- **First failure**: Analyze the error, adjust delegation parameters (more context, narrower scope, different approach), retry automatically
- **Subsequent failures up to limit**: Continue retrying with progressively adjusted parameters
- **Limit exceeded**: Mark phase as `failed`, stop execution, escalate to user

Increment `retry_count` in session state on each retry attempt.

### Timeout Handling

When a subagent times out:
1. Record partial output in session state if available
2. Report the timeout to the user with context about what was attempted
3. Offer options: retry with adjusted parameters, skip phase, or abort

### File Conflict Handling

When a subagent reports a file conflict (concurrent modification):
1. Stop execution immediately
2. Report conflict details to user (which files, which agents)
3. Do NOT attempt automatic resolution
4. Wait for user guidance before proceeding

### Error Escalation Format

Present failures to the user in this structured format:

```
Phase Execution Failed: [phase-name]

Agent: [agent-name]
Attempt: [N] of [MAESTRO_MAX_RETRIES, default 2]
Error Type: [error-type]

Error Message:
[full error message]

Context:
[what the agent was trying to do]
[relevant files/parameters]

Options:
1. Manually fix the issue and retry this phase
2. Skip this phase and continue
3. Abort orchestration and review session state
4. Adjust delegation parameters and retry

What would you like to do?
```

## Subagent Output Processing

### Task Report Parsing

After each subagent completes, parse its Task Report to extract:
- **Status**: `success`, `failure`, or `partial`
- **Files Created/Modified/Deleted**: Update session state file manifest
- **Downstream Context**: Extract Part 2 fields (`Key Interfaces Introduced`, `Patterns Established`, `Integration Points`, `Assumptions`, `Warnings`) into phase `downstream_context`
- **Validation**: `pass`, `fail`, or `skipped`
- **Errors**: Append to session state errors array

### State Update Sequence

After processing each Task Report:
1. Update phase `files_created`, `files_modified`, `files_deleted`
2. Update phase `downstream_context` from the parsed Handoff Report Part 2 (or empty lists when legitimately omitted)
3. Append any errors to phase `errors` array
4. Aggregate token usage into session `token_usage`
5. If validation passed: transition phase to `completed`
6. If validation failed: trigger retry logic
7. Update `updated` timestamp

## Completion Protocol

### Final Review

When all phases are completed:
1. Review all phase statuses — confirm none are `failed` or `pending`
2. Verify all deliverables from the implementation plan are accounted for
3. Cross-reference the file manifest against expected outputs

### Deliverable Verification

For each phase in the implementation plan:
- Confirm expected files were created/modified
- Confirm validation passed (or was explicitly skipped by user)
- Flag any deviations from the plan

### Archival Trigger

After successful completion:
1. Activate the `session-management` skill
2. Execute the archive protocol
3. Move design document, implementation plan, and session state to archive directories

### Summary Format

Present the final orchestration summary:

```
Orchestration Complete: [session_id]

Delivered:
- [bullet point summary of what was built/changed]

Files Changed:
- Created: [count] files
- Modified: [count] files
- Deleted: [count] files

Token Usage:
- Total: [input + output tokens]
- By Agent: [top 3 agents by usage]

Deviations from Plan:
- [any changes from original plan, or "None"]

Recommended Next Steps:
- [actionable follow-up items]
```
