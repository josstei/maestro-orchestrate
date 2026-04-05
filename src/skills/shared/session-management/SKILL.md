---
name: session-management
description: Manages orchestration session state, tracking, and resumption
---

# Session Management Skill

Activate this skill for all session state operations during Maestro orchestration. This skill defines the protocols for creating, updating, resuming, and archiving orchestration sessions.

## State Access Protocol

When MCP state tools are available, prefer them for state operations:
- **Preferred**: MCP tools (`initialize_workspace`, `create_session`, `update_session`, `transition_phase`, `get_session_status`, `archive_session`) — structured I/O, atomic operations.
- **Fallback**: `write_file`/`replace` directly on state files — when MCP tools are not in the available tool list.
- **Legacy**: Shell scripts (`write-state.js`, `read-state.js`) — remain available but are not the recommended path.

Detection: check whether MCP state tools appear in your available tools. If they do, use them. If they do not, use `write_file`/`replace`.

## Hook-Level Session State

Maestro hooks maintain a separate, transient state directory at `/tmp/maestro-hooks/<session-id>/` that is distinct from orchestration state in `<MAESTRO_STATE_DIR>`:

| Concern | Orchestration State | Hook State |
| --- | --- | --- |
| Location | `<MAESTRO_STATE_DIR>/state/` | `/tmp/maestro-hooks/<session-id>/` (Unix) or `<os.tmpdir()>/maestro-hooks/<session-id>/` (Windows) |
<!-- @feature geminiHookModel -->
| Lifecycle | Created in Phase 2, archived in Phase 4 | Directory created by `SessionStart` when an active session exists; active-agent file written by `BeforeAgent` and cleared by `AfterAgent`; stale directories pruned by both `SessionStart` and `BeforeAgent` |
<!-- @end-feature -->
<!-- @feature claudeHookModel -->
| Lifecycle | Created in Phase 2, archived in Phase 4 | Directory created by `hooks system (SessionStart)` when an active session exists; active-agent file written by `hooks system (PreToolUse)` and cleared by `orchestrator inline validation (no hook — see SKIP_EVENTS_CLAUDE)`; stale directories pruned by both `hooks system (SessionStart)` and `hooks system (PreToolUse)` |
<!-- @end-feature -->
| Contents | Session metadata, phase tracking, token usage, file manifests | Active agent tracking file (`active-agent`) |
| Persistence | Survives session restarts (supports `/maestro:resume`) | Ephemeral — lost on session end or system reboot |
| Managed by | Orchestrator via session-management skill | The runtime's pre-delegation and post-delegation hooks |

<!-- @feature geminiHookModel -->
The `BeforeAgent` prunes stale hook state directories older than 2 hours to prevent accumulation from abnormal session terminations.
<!-- @end-feature -->
<!-- @feature claudeHookModel -->
The `hooks system (PreToolUse)` prunes stale hook state directories older than 2 hours to prevent accumulation from abnormal session terminations.
<!-- @end-feature -->

The orchestrator does not read or write hook-level state directly. It interacts only with `<MAESTRO_STATE_DIR>` paths. The two state systems are independent and serve different concerns.

## Session Creation Protocol

### When to Create
For Standard workflow, create a new session when beginning Phase 2 (Team Assembly & Planning) of orchestration, after the design document has been approved. For Express workflow, create a session after the structured brief is approved (see Express Workflow section in the orchestrator template).

### Session ID Format
`YYYY-MM-DD-<topic-slug>`

Where:
- `YYYY-MM-DD` is the orchestration start date
- `<topic-slug>` is a lowercase, hyphenated summary matching the design document topic

### File Location
`<MAESTRO_STATE_DIR>/state/active-session.md`

<!-- @feature geminiStateContract -->
All state paths in this skill use `<MAESTRO_STATE_DIR>` as their base directory. In procedural steps, `<state_dir>` represents the resolved value of this variable.
<!-- @end-feature -->
<!-- @feature claudeStateContract -->
All state paths in this skill use `<MAESTRO_STATE_DIR>` as their base directory. In procedural steps, `docs/maestro` represents the resolved value of this variable.
<!-- @end-feature -->

### State File Access

Both `read_file` and `write_file` work on state paths inside `<MAESTRO_STATE_DIR>`. The runtime's file-access configuration makes state paths accessible.

Use `${extensionPath}/scripts/` for script locations so these commands work even when the extension is installed outside the workspace root.

**Reading state files:**
Use `read_file` directly. The `read-state.js` script remains available as an alternative for TOML shell blocks that inject state before the model's first turn:

`run_shell_command`: `node ${extensionPath}/scripts/read-state.js <relative-path>`

**Writing state files:**
Use `write_file` directly. When content must be piped from a shell command, use the atomic write script:

`run_shell_command`: `echo '...' | node ${extensionPath}/scripts/write-state.js <relative-path>`

**Rules:**
- The `write-state.js` script writes atomically (temp file + rename) to prevent partial writes
- Both scripts validate against absolute paths and path traversal

### Initialization Steps
1. Resolve state directory from `MAESTRO_STATE_DIR`
<!-- @feature geminiStateContract -->
2. Create `<state_dir>/state/` directory if it does not exist (defense-in-depth fallback — workspace readiness startup check is the primary mechanism)
<!-- @end-feature -->
<!-- @feature claudeStateContract -->
2. Create `docs/maestro/state/` directory if it does not exist (defense-in-depth fallback — workspace readiness startup check is the primary mechanism)
<!-- @end-feature -->
3. Verify no existing `active-session.md` — if one exists, alert the user and offer to archive or resume
4. Generate session state using the template from `templates/session-state.md`
5. Initialize all phases as `pending`
6. Set overall status to `in_progress`
7. Set `current_phase` to 1
8. Record design document and implementation plan paths
9. Initialize empty token_usage, file manifests, downstream_context, and errors sections

### Initial State Template

```yaml
---
session_id: "<YYYY-MM-DD-topic-slug>"
task: "<user's original task description>"
created: "<ISO 8601 timestamp>"
updated: "<ISO 8601 timestamp>"
status: "in_progress"
workflow_mode: "<standard|express>"
<!-- @feature geminiStateContract -->
design_document: "<state_dir>/plans/<design-doc-filename>"
implementation_plan: "<state_dir>/plans/<impl-plan-filename>"
<!-- @end-feature -->
<!-- @feature claudeStateContract -->
design_document: "docs/maestro/plans/<design-doc-filename>"
implementation_plan: "docs/maestro/plans/<impl-plan-filename>"
<!-- @end-feature -->
current_phase: 1
total_phases: <integer from impl plan>
execution_mode: null
execution_backend: null
task_complexity: null

token_usage:
  total_input: 0
  total_output: 0
  total_cached: 0
  by_agent: {}

phases:
  - id: 1
    name: "<phase name from impl plan>"
    status: "pending"
    agents: []
    parallel: false
    started: null
    completed: null
    blocked_by: []
    files_created: []
    files_modified: []
    files_deleted: []
    downstream_context:
      key_interfaces_introduced: []
      patterns_established: []
      integration_points: []
      assumptions: []
      warnings: []
    errors: []
    retry_count: 0
---

# <Topic> Orchestration Log
```

Include `task_complexity` (from design document frontmatter) in the session state. Place after `execution_backend`, before `token_usage`. Default: `null`.

## State Update Protocol

### Update Triggers
Update session state on every meaningful state change:
- Phase status transitions
- File manifest changes
- Downstream context extraction from completed phases
- Error occurrences
- Token usage increments
- Phase completion or failure

### Update Rules

1. **Timestamp**: Update `updated` field on every state change
2. **Phase Status**: Transition phase status following valid transitions:
   - `pending` -> `in_progress`
   - `in_progress` -> `completed`
   - `in_progress` -> `failed`
   - `failed` -> `in_progress` (retry)
   - `pending` -> `skipped` (user decision only)
3. **Current Phase**: Update `current_phase` to the ID of the currently executing phase
4. **File Manifest**: Append to `files_created`, `files_modified`, or `files_deleted` as subagents report changes
5. **Downstream Context**: Persist parsed Handoff Report Part 2 fields into phase `downstream_context`
6. **Token Usage**: Aggregate token counts from subagent responses into both `total_*` and `by_agent` sections
7. **Error Recording**: Append to phase `errors` array with complete metadata

### Error Recording Format

```yaml
errors:
  - agent: "<agent-name>"
    timestamp: "<ISO 8601>"
    type: "<validation|timeout|file_conflict|runtime|dependency>"
    message: "<full error description>"
    resolution: "<what was done to resolve, or 'pending'>"
    resolved: false
```

### Retry Tracking
- Increment `retry_count` on each retry attempt
- Maximum 2 retries per phase before escalating to user
- Record each retry as a separate error entry with resolution details

### Markdown Body Updates
After updating YAML frontmatter, append to the Markdown body:

```markdown
## Phase N: <Phase Name> <status indicator>

### <Agent Name> Output
[Summary of agent output or full content]

### Files Changed
- Created: [list]
- Modified: [list]

### Downstream Context
- Key Interfaces Introduced: [list]
- Patterns Established: [list]
- Integration Points: [list]
- Assumptions: [list]
- Warnings: [list]

### Validation Result
[Pass/Fail with details]
```

Status indicators:
- Completed: checkmark
- In Progress: circle
- Failed: cross
- Pending: square
- Skipped: dash

## Archive Protocol

### When to Archive
Archive session state when:
- All phases are completed successfully AND `MAESTRO_AUTO_ARCHIVE` is `true` (default)
- User explicitly requests archival (regardless of `MAESTRO_AUTO_ARCHIVE` setting)
- User starts a new orchestration (previous session must be archived first, regardless of setting)

When `MAESTRO_AUTO_ARCHIVE` is `false`, prompt the user after successful completion: "Session complete. Auto-archive is disabled. Would you like to archive this session?"

### Archive Steps
If `archive_session` appears in your available tools, use it — a single call handles all archival:
<!-- @feature geminiStateContract -->
1. Call `archive_session` with the session ID. The MCP tool atomically:
   - Updates session status to `completed`
   - Moves `active-session.md` to `<state_dir>/state/archive/<session-id>.md`
   - Moves design document to `<state_dir>/plans/archive/` (if it exists and is non-null)
   - Moves implementation plan to `<state_dir>/plans/archive/` (if it exists and is non-null)
2. Confirm archival to user with summary of what was archived (use the `archived_files` array in the response)

If `archive_session` is not available, fall back to manual file operations:
1. Create `<state_dir>/plans/archive/` directory if it does not exist
2. Create `<state_dir>/state/archive/` directory if it does not exist
3. **MOVE** (not copy) design document from `<state_dir>/plans/` to `<state_dir>/plans/archive/` — the original MUST be deleted. Use `run_shell_command` with `mv` or read+write+delete. Do NOT leave the file in both locations. **Skip this step if `design_document` is `null` (Express sessions).**
4. **MOVE** (not copy) implementation plan from `<state_dir>/plans/` to `<state_dir>/plans/archive/` — same: delete the original. **Skip this step if `implementation_plan` is `null` (Express sessions).**
5. Update session state `status` to `completed`
6. Update `updated` timestamp
7. **MOVE** (not copy) `active-session.md` from `<state_dir>/state/` to `<state_dir>/state/archive/<session-id>.md` — delete the original.
8. Confirm archival to user with summary of what was archived

### Archive Verification
After archival, verify ALL of the following (archive is incomplete if any check fails):
- No `active-session.md` exists in `<state_dir>/state/`
- No plan files remain in `<state_dir>/plans/` (only the `archive/` subdirectory should be present)
<!-- @end-feature -->
<!-- @feature claudeStateContract -->
1. Call `archive_session` with the session ID. The MCP tool atomically:
   - Updates session status to `completed`
   - Moves `active-session.md` to `docs/maestro/state/archive/<session-id>.md`
   - Moves design document to `docs/maestro/plans/archive/` (if it exists and is non-null)
   - Moves implementation plan to `docs/maestro/plans/archive/` (if it exists and is non-null)
2. Confirm archival to user with summary of what was archived (use the `archived_files` array in the response)

If `archive_session` is not available, fall back to manual file operations:
1. Create `docs/maestro/plans/archive/` directory if it does not exist
2. Create `docs/maestro/state/archive/` directory if it does not exist
3. **MOVE** (not copy) design document from `docs/maestro/plans/` to `docs/maestro/plans/archive/` — the original MUST be deleted. Use `run_shell_command` with `mv` or read+write+delete. Do NOT leave the file in both locations. **Skip this step if `design_document` is `null` (Express sessions).**
4. **MOVE** (not copy) implementation plan from `docs/maestro/plans/` to `docs/maestro/plans/archive/` — same: delete the original. **Skip this step if `implementation_plan` is `null` (Express sessions).**
5. Update session state `status` to `completed`
6. Update `updated` timestamp
7. **MOVE** (not copy) `active-session.md` from `docs/maestro/state/` to `docs/maestro/state/archive/<session-id>.md` — delete the original.
8. Confirm archival to user with summary of what was archived

### Archive Verification
After archival, verify ALL of the following (archive is incomplete if any check fails):
- No `active-session.md` exists in `docs/maestro/state/`
- No plan files remain in `docs/maestro/plans/` (only the `archive/` subdirectory should be present)
<!-- @end-feature -->
- Archived files are readable at their new locations in `archive/`
- If files still exist in the original locations, delete them now — the archive step used copy instead of move

## Resume Protocol

### When to Resume
Resume is triggered by the `/maestro:resume` command or when `/maestro:orchestrate` detects an existing active session.

### Resume Steps

1. **Read State**: If session state was already injected into the prompt (e.g., via `/maestro:resume`), use that injected content instead of calling `get_session_status`. Otherwise, if `get_session_status` appears in your available tools, call it to read the active session. Otherwise, read state via `run_shell_command`: `node ${extensionPath}/scripts/read-active-session.js` (resolves `MAESTRO_STATE_DIR` internally)
2. **Parse Frontmatter**: Extract YAML frontmatter for session metadata
3. **Identify Position**: Determine:
   - Last completed phase (highest ID with `status: completed`)
   - Current active phase (first phase with `status: in_progress` or `pending`)
   - Any failed phases with unresolved errors
4. **Check Errors**: Identify unresolved errors from previous execution
5. **Present Summary**: Display status summary to user using the resume format defined in the orchestrator instructions
6. **Handle Errors**: If unresolved errors exist:
   - Present each error with context
   - Offer options: retry, skip, abort, or adjust parameters
   - Wait for user guidance before proceeding
7. **Continue Execution**: Resume from the first pending or failed phase
8. **Update State**: Mark resumed phase as `in_progress` and update timestamps

### Express Resume Branch

When resuming a session with `workflow_mode: "express"` (read from session state via `get_session_status`), follow the Express workflow's resume protocol instead of the standard resume steps above:

- If phase status is `pending`: re-generate and present the structured brief for approval. On approval, proceed to delegation.
- If phase status is `in_progress`: the implementing agent was interrupted. Re-delegate with the same scope. Use the `agents` array to identify which agent was running.
- If phase status is `completed` but session status is `in_progress`: code review or archival was interrupted. Run the code review step, then archive.

Express sessions have a single phase. The phase status combined with the `agents` array contents determines the resume position.

### Conflict Detection
When resuming, check for potential conflicts:
- Files that were partially modified (phase started but not completed)
- External modifications to files in the manifest since last session
- Changes to the implementation plan since last execution

Report any detected conflicts to the user before proceeding.

## Token Usage Tracking

### Collection
After each subagent invocation, record:
- Input tokens consumed
- Output tokens generated
- Cached tokens used (if available)

### Aggregation
Maintain two levels of aggregation:
1. **Total**: Sum across all agents and phases
2. **By Agent**: Per-agent totals across all their invocations

### Format

```yaml
token_usage:
  total_input: 15000
  total_output: 8000
  total_cached: 3000
  by_agent:
    coder:
      input: 8000
      output: 4000
      cached: 2000
    tester:
      input: 7000
      output: 4000
      cached: 1000
```
