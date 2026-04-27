---
name: execution
description: Phase execution methodology for orchestration workflows with error handling and completion protocols
---

# Execution Skill

Activate this skill during Phase 3 (Execution) of Maestro orchestration. This skill defines how Maestro executes implementation phases through native subagent delegation.

## Execution Mode Gate

### Step 0 — Express bypass (early return)

If `workflow_mode` is `express` in the current session, STOP HERE. Do not proceed
to the execution mode gate. Do not prompt the user. Do not resolve execution mode.
Express always dispatches sequentially. Return to the Express Workflow and continue
from the delegation step.

<HARD-GATE>
This gate MUST resolve before ANY delegation proceeds. Do not skip it. Do not defer it. Do not begin delegating to subagents until execution_mode is recorded in session state. If you reach a delegation step and execution_mode is not set, STOP and return here.
</HARD-GATE>

### Step 1 — Read the configured mode

Read `MAESTRO_EXECUTION_MODE` (default: `ask`).

- If `parallel`: call `update_session` with `{ execution_mode: 'parallel', execution_backend: 'native' }` to record in session state. Skip to delegation.
- If `sequential`: call `update_session` with `{ execution_mode: 'sequential', execution_backend: 'native' }` to record in session state. Skip to delegation.
- If `ask`: proceed to Step 2.

### Step 2 — Analyze the implementation plan

Before prompting the user, analyze the approved plan to generate a recommendation:

1. Count total phases in the plan
2. Count phases marked `parallel: true` (parallelizable phases)
3. Count distinct parallel batches (groups of parallelizable phases at the same dependency depth)
4. Count sequential-only phases (phases with `blocked_by` dependencies that prevent parallelization)
5. Cross-check file ownership across all phases. If any two phases share a file in their `files` arrays, those phases CANNOT be parallel-eligible — subtract them from the parallelizable count. Report each overlap as an Overlapping-file Warning in the prompt.

6. If `validate_plan` was called during planning and returned a `parallelization_profile`, use its `parallel_eligible` and `effective_batches` counts as the authoritative source for items 1-5 above. These are computed from actual dependency depths and override any manual flag-based counts. If `parallelization_profile` is not available, use the counts from items 1-5 as-is.

Record these counts — they feed into the prompt.

### Step 3 — Determine the recommendation

- If parallelizable phases ≤ 1 → auto-select **sequential**. Call `update_session` with `{ execution_mode: 'sequential', execution_backend: 'native' }`. Inform the user: "All phases are sequential — no parallel batches available." Skip to delegation. Do NOT prompt with a choice. Do NOT call `ask_user`. Do NOT present options. (Parallelism requires at least 2 phases at the same dependency depth; a single parallel-eligible phase has nothing to batch with.)

<ANTI-PATTERN>
WRONG — 1 parallel-eligible phase but user still prompted:
  Parallel-eligible Phases: 1
  → Presented choice: "Sequential (Recommended)" / "Parallel"

When parallelizable phases ≤ 1, there is NO choice to make. Auto-select sequential
and skip directly to delegation. Do not show a picker.
</ANTI-PATTERN>

- If parallelizable phases > 50% of total phases → recommend **parallel**
- If parallelizable phases ≤ 50% but > 1 → recommend **sequential** (limited benefit)
- The recommended option appears first in the `ask_user` options list with "(Recommended)" appended to its label. The non-recommended option MUST NOT include "(Recommended)" in its label.

### Step 4 — Prompt the user

Call `ask_user` with `type: 'choice'` using exactly one of these option sets:

**When recommending parallel:**
  options:
    - label: "Parallel (Recommended)"
      description: "Spawn child agents for each ready batch where file ownership does not overlap."
    - label: "Sequential (High Precision)"
      description: "Spawn one child agent at a time in dependency order."

**When recommending sequential:**
  options:
    - label: "Sequential (Recommended)"
      description: "Spawn one child agent at a time in dependency order."
    - label: "Parallel"
      description: "Spawn child agents for each ready batch where file ownership does not overlap."

<ANTI-PATTERN>
WRONG — Both options labeled "(Recommended)":
  options:
    - label: "Parallel (Recommended)"
    - label: "Sequential (High Precision) (Recommended)"

Only ONE option receives the "(Recommended)" suffix. Never both.
</ANTI-PATTERN>

Prompt the user for a choice using the user-prompt tool from runtime context. Replace `[N]`, `[M]`, and `[B]` with actual counts from Step 2. The prompt should convey the execution mode analysis and offer two options as described above.
### Step 5 — Record and proceed

1. Call `update_session` with the selected `execution_mode` and `execution_backend: native`
2. The tool atomically persists both fields
3. Use the selected mode for the remainder of the session unless the user changes it

### Mode-specific behavior

- If `parallel` is selected and a ready batch has only one phase, execute it sequentially
- If `sequential` is selected, preserve plan order even when phases are parallel-safe

### Safety fallback

If `execution_mode` is not present in session state at the point where delegation is about to begin, STOP. Do not default to sequential. Return to this gate and resolve it. This catches any edge case where the gate was skipped.

## State File Access

When MCP state tools (`get_session_status`, `update_session`, `transition_phase`) are available, prefer them for state operations. They provide structured I/O and atomic transitions.

When MCP tools are not available, state lives inside `<MAESTRO_STATE_DIR>` and is accessible through `read_file` and `write_file`.

Helper scripts remain available for shell-injected command prompts:

```bash
node <runtime-script-root>/read-state.js <relative-path>
node <runtime-script-root>/read-active-session.js
```

## Hook Lifecycle During Execution

Hooks fire automatically at agent boundaries. The orchestrator does not invoke them directly.

The hooks system tracks which agent is currently executing. Before each agent dispatch, a hook resolves the active agent identity from the required `Agent:` header first, then falls back to legacy env/regex detection, and injects compact session context. After completion, a hook validates that the response contains both `Task Report` and `Downstream Context`; it requests one retry on the first malformed response.

The hook state directory under `/tmp/maestro-hooks/<session-id>/` is transient and separate from orchestration state.

## Sequential Execution Protocol

For a sequential phase:

1. Verify all `blocked_by` dependencies are completed
2. Mark the phase `in_progress`
3. Update `current_phase`
4. Set `current_batch: null`
5. Update the progress-tracking tool (use the tool names from `get_runtime_context`) before delegation
6. Delegate to the assigned agent with the required header and full context
7. Parse the returned handoff
8. Update session state
9. Mark the phase `completed` or `failed`
10. Update the progress-tracking tool after the state update

## Native Parallel Execution Protocol

Use native parallel execution only for sibling phases at the same dependency depth with non-overlapping file ownership.

### Batch Rules

1. Verify all blocking phases for every phase in the batch are completed
2. Slice the ready batch into the current dispatch chunk using `MAESTRO_MAX_CONCURRENT`
3. Mark only the current chunk phases `in_progress`
4. Set `current_batch` in session state for that chunk
5. Write one in-progress todo item for the chunk
6. In the next turn, emit only runtime dispatch calls for that chunk
7. Do not mix shell commands, validation commands, file writes, or narration between those dispatch calls
8. `MAESTRO_MAX_CONCURRENT=0` means emit the entire ready batch in one turn

### Native Constraints

- The runtime only parallelizes contiguous dispatch calls in one turn
- Native subagents currently run without user approval gates
- `ask_user` remains available; a batch may pause while waiting for user input
- If execution is interrupted, restart unfinished `in_progress` phases on resume instead of attempting to restore in-flight subagent interactions

## Progress Context

Include the following in every delegation query body:

```text
Progress: Phase [N] of [M]: [Phase Name]
Session: [session_id]
```

For native parallel batches, also include the batch identifier in the required header:

```text
Agent: <agent_name>
Phase: <id>/<total>
Batch: <batch_id>
Session: <session_id>
```

## Error Handling Protocol

Record all errors in session state with:

- `agent`
- `timestamp`
- `type`
- `message`
- `resolution`

### Retry Logic

- Maximum retries per phase: `MAESTRO_MAX_RETRIES` (default `2`)
- First failure: analyze, adjust context/scope, retry automatically
- Subsequent failures up to the limit: continue retrying with clearer constraints
- Limit exceeded: mark the phase `failed` and escalate to the user

Increment `retry_count` on each retry.

### Recovery Protocol

When a subagent terminates early, times out, returns malformed output, or when `delegation.constraints.result_surface` is `deferred` and the agent's text cannot be retrieved:

1. **Poll**: For deferred-result runtimes (Codex), call the runtime's wait tool (`wait_agent` equivalent) with a bounded timeout. For synchronous runtimes, the initial dispatch return IS the result.
2. **Detect drift**: Call `scan_phase_changes(session_id, phase_id)`. If the returned `candidates.created` or `candidates.modified` arrays are non-empty, the agent produced filesystem output without a handoff.
3. **Ask the user to confirm**: Using the runtime's user-prompt tool, present the scan candidates and ask the user to confirm which files belong to this phase. For a parallel batch, include the `planned_files` from each phase's session state to assist attribution. If the scan surfaces files beyond any phase's `planned_files`, raise a blocker and surface the ambiguity to the user rather than silently attributing.
4. **Reconcile**: Call `reconcile_phase(session_id, phase_id, files_created, files_modified, files_deleted, downstream_context, reason)` with the user-confirmed manifest. This clears `requires_reconciliation`.
5. **Retry or advance**: If the user chose to retry the agent, re-delegate with the original scope plus the scan results as context. If the user accepted the work as delivered, advance to the next phase.

Record all recovery events in session state with `{agent, timestamp, type: 'recovery', resolution: 'retry'|'reconciled'|'aborted'}`.

### File Conflict Handling

When a subagent reports a file conflict:

1. Stop execution immediately
2. Record the conflicting files and phases
3. Do not attempt automatic merge resolution
4. Ask the user how to proceed

## Subagent Output Processing

Native subagent results are wrapped. Do not assume the handoff begins at byte 0.

### Parsing Rules

1. Locate `## Task Report` (or `# Task Report`) inside the returned text
2. Locate `## Downstream Context` (or `# Downstream Context`) inside the returned text
3. Parse:
   - status
   - files created / modified / deleted
   - downstream context fields
   - validation result
   - reported errors
4. Persist the full raw output plus the parsed fields into session state

### State Update Sequence

After processing each handoff:

1. Update the phase file manifests
2. Update `downstream_context`
3. Append any errors
4. Aggregate token usage
5. If validation passed, mark the phase `completed`
6. If validation failed, trigger retry logic
7. Update `updated`
8. Advance or clear `current_batch` as each chunk finishes

## Completion Protocol

When all phases are completed:

1. Verify there are no `failed` or `pending` phases
2. Confirm plan deliverables are accounted for
3. Run the final code-review gate for non-documentation changes
4. Archive the session through `session-management`
5. Present a final summary with deliverables, files changed, token usage, deviations, and review status
