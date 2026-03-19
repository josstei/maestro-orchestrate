---
name: execution
description: Phase execution methodology for orchestration workflows with error handling and completion protocols
---

# Execution Skill

Activate this skill during Phase 3 (Execution) of Maestro orchestration. This skill defines how Maestro executes implementation phases through native subagent delegation.

## Execution Mode Gate

<HARD-GATE>
This gate MUST resolve before ANY delegation proceeds. Do not skip it. Do not defer it. Do not begin delegating to subagents until execution_mode is recorded in session state. If you reach a delegation step and execution_mode is not set, STOP and return here.

**Exception:** If `workflow_mode` is `express`, this gate does not apply. Express workflow bypasses execution-mode resolution entirely and dispatches sequentially.
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
5. Check for any overlapping file ownership warnings across parallel-eligible phases

Record these counts — they feed into the prompt.

### Step 3 — Determine the recommendation

- If parallelizable phases > 50% of total phases → recommend **parallel**
- If parallelizable phases ≤ 1 → recommend **sequential**
- Otherwise (parallelizable > 1 but ≤ 50%) → recommend **sequential** (limited parallelization benefit)
- The recommended option appears first in the `ask_user` options list with "(Recommended)" appended to its label

### Step 3a — Reconcile with validate_plan profile

If `validate_plan` was called during planning and returned a `parallelization_profile`, use its `parallel_eligible` and `effective_batches` counts as the authoritative source for Steps 2-3. These are computed from actual dependency depths and override any manual flag-based counts.

If `parallelization_profile` is not available, compute counts from the plan's `blocked_by` structure using dependency depth analysis. Do not count `parallel: true` flags without verifying that the flagged phases actually share a dependency depth with at least one other phase.

### Step 4 — Prompt the user

Call `ask_user` with `type: 'choice'`. The question must include the plan analysis numbers so the user can make an informed decision.

When parallel is recommended:

```json
{
  "questions": [{
    "header": "Exec mode",
    "question": "Execution Mode: [N] of [M] phases are parallelizable in [B] batches. How should phases be executed?",
    "type": "choice",
    "options": [
      {
        "label": "Parallel (Recommended)",
        "description": "[N] phases run concurrently in [B] batches. Faster execution but agents run autonomously."
      },
      {
        "label": "Sequential",
        "description": "All [M] phases run one at a time in plan order. Slower but allows step-by-step review."
      }
    ]
  }]
}
```

When sequential is recommended (parallelizable ≤ 1):

```json
{
  "questions": [{
    "header": "Exec mode",
    "question": "Execution Mode: Only [N] of [M] phases can run in parallel. How should phases be executed?",
    "type": "choice",
    "options": [
      {
        "label": "Sequential (Recommended)",
        "description": "Phases run one at a time in plan order. Best for this plan's dependency structure."
      },
      {
        "label": "Parallel",
        "description": "Parallel batching available for [N] phase(s). Limited benefit for this plan."
      }
    ]
  }]
}
```

Replace `[N]`, `[M]`, and `[B]` with actual counts from Step 2.

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
node ${extensionPath}/scripts/read-state.js <relative-path>
node ${extensionPath}/scripts/read-active-session.js
```

## Hook Lifecycle During Execution

Hooks fire automatically at agent boundaries. The orchestrator does not invoke them directly.

- `BeforeAgent`: resolves active agent identity from the required `Agent:` header first, then falls back to legacy env/regex detection, and injects compact session context
- `AfterAgent`: validates that the response contains both `Task Report` and `Downstream Context`; requests one retry on the first malformed response

The hook state directory under `/tmp/maestro-hooks/<session-id>/` is transient and separate from orchestration state.

## Sequential Execution Protocol

For a sequential phase:

1. Verify all `blocked_by` dependencies are completed
2. Mark the phase `in_progress`
3. Update `current_phase`
4. Set `current_batch: null`
5. Update `write_todos` before delegation
6. Delegate to the assigned agent with the required header and full context
7. Parse the returned handoff
8. Update session state
9. Mark the phase `completed` or `failed`
10. Update `write_todos` after the state update

## Native Parallel Execution Protocol

Use native parallel execution only for sibling phases at the same dependency depth with non-overlapping file ownership.

### Batch Rules

1. Verify all blocking phases for every phase in the batch are completed
2. Slice the ready batch into the current dispatch chunk using `MAESTRO_MAX_CONCURRENT`
3. Mark only the current chunk phases `in_progress`
4. Set `current_batch` in session state for that chunk
5. Write one in-progress todo item for the chunk
6. In the next turn, emit only agent tool calls for that chunk
7. Do not mix shell commands, validation commands, file writes, or narration between those agent calls
8. `MAESTRO_MAX_CONCURRENT=0` means emit the entire ready batch in one turn

### Native Constraints

- The runtime only parallelizes contiguous agent calls in one turn
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

### Timeout / Termination Handling

When a native subagent terminates early or exceeds its configured timeout:

1. Record any useful partial output in session state
2. Report what the agent was attempting
3. Retry with narrower scope when reasonable
4. Escalate if repeated failures continue

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
