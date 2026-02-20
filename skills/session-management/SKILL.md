---
name: session-management
description: Manages orchestration session state, tracking, and resumption
---

# Session Management Skill

Activate this skill for all session state operations during Maestro orchestration. This skill defines the protocols for creating, updating, resuming, and archiving orchestration sessions.

## Hook-Level Session State

Maestro hooks maintain a separate, transient state directory at `/tmp/maestro-hooks/<session-id>/` that is distinct from orchestration state in `<MAESTRO_STATE_DIR>`:

| Concern | Orchestration State | Hook State |
| --- | --- | --- |
| Location | `<MAESTRO_STATE_DIR>/state/` | `/tmp/maestro-hooks/<session-id>/` |
| Lifecycle | Created in Phase 2, archived in Phase 4 | Created lazily by `BeforeAgent` on first active-agent write; active-agent file cleared by `AfterAgent`; stale directories pruned periodically |
| Contents | Session metadata, phase tracking, token usage, file manifests | Active agent tracking file (`active-agent`) |
| Persistence | Survives session restarts (supports `/maestro:resume`) | Ephemeral — lost on session end or system reboot |
| Managed by | Orchestrator via session-management skill | Hooks (`before-agent.js`, `after-agent.js`) |

The `BeforeAgent` hook prunes stale hook state directories older than 2 hours to prevent accumulation from abnormal session terminations.

The orchestrator does not read or write hook-level state directly. It interacts only with `<MAESTRO_STATE_DIR>` paths. The two state systems are independent and serve different concerns.

## Session Creation Protocol

### When to Create
Create a new session when beginning Phase 2 (Team Assembly & Planning) of orchestration, after the design document has been approved.

### Session ID Format
`YYYY-MM-DD-<topic-slug>`

Where:
- `YYYY-MM-DD` is the orchestration start date
- `<topic-slug>` is a lowercase, hyphenated summary matching the design document topic

### File Location
`<MAESTRO_STATE_DIR>/state/active-session.md`

Where `MAESTRO_STATE_DIR` defaults to `.gemini` if not set. All state paths in this skill use `<MAESTRO_STATE_DIR>` as their base directory. In procedural steps, `<state_dir>` represents the resolved value of this variable.

### State File Access

The `read_file` tool enforces `.gitignore` and `.geminiignore` patterns via `shouldIgnoreFile()`. Since `.gemini/` is typically gitignored, `read_file` will reject paths inside the state directory. All reads must use the dedicated Node.js script to bypass this restriction.

Use `${extensionPath}` for script locations so these commands work even when the extension is installed outside the workspace root.

**Reading state files:**
```bash
run_shell_command: node ${extensionPath}/scripts/read-state.js <relative-path>
```

Example: `node ${extensionPath}/scripts/read-state.js <state_dir>/state/active-session.md`

**Writing state files:**
Use `write_file` as the primary mechanism for state file writes — `write_file` does not enforce the same ignore patterns as `read_file`, so it can write to `.gemini/` paths directly. When content must be piped from a shell command, use:

```bash
run_shell_command: echo '...' | node ${extensionPath}/scripts/write-state.js <relative-path>
```

**Rules:**
- Never use `read_file` for paths inside `<MAESTRO_STATE_DIR>` — `read_file` enforces `.gitignore` patterns and will reject these paths
- Use `write_file` directly for state writes (no ignore enforcement on writes)
- The `write-state.js` script writes atomically (temp file + rename) to prevent partial writes
- Both scripts validate against absolute paths and path traversal

### Initialization Steps
1. Resolve state directory from `MAESTRO_STATE_DIR` (default: `.gemini`)
2. Create `<state_dir>/state/` directory if it does not exist (defense-in-depth fallback — workspace readiness startup check is the primary mechanism)
3. Verify no existing `active-session.md` — if one exists, alert the user and offer to archive or resume
3. Generate session state using the template from `templates/session-state.md`
4. Initialize all phases as `pending`
5. Set overall status to `in_progress`
6. Set `current_phase` to 1
7. Record design document and implementation plan paths
8. Initialize empty token_usage, file manifests, downstream_context, and errors sections

### Initial State Template

```yaml
---
session_id: "<YYYY-MM-DD-topic-slug>"
task: "<user's original task description>"
created: "<ISO 8601 timestamp>"
updated: "<ISO 8601 timestamp>"
status: "in_progress"
design_document: "<state_dir>/plans/<design-doc-filename>"
implementation_plan: "<state_dir>/plans/<impl-plan-filename>"
current_phase: 1
total_phases: <integer from impl plan>
execution_mode: null

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
1. Create `<state_dir>/plans/archive/` directory if it does not exist (defense-in-depth fallback — workspace readiness startup check is the primary mechanism)
2. Create `<state_dir>/state/archive/` directory if it does not exist (defense-in-depth fallback — workspace readiness startup check is the primary mechanism)
3. Move design document from `<state_dir>/plans/` to `<state_dir>/plans/archive/`
4. Move implementation plan from `<state_dir>/plans/` to `<state_dir>/plans/archive/`
5. Update session state `status` to `completed`
6. Update `updated` timestamp
7. Move `active-session.md` from `<state_dir>/state/` to `<state_dir>/state/archive/<session-id>.md`
8. Confirm archival to user with summary of what was archived

### Archive Verification
After archival, verify:
- No `active-session.md` exists in `<state_dir>/state/`
- Archived files are readable at their new locations
- Plan files are no longer in active `<state_dir>/plans/` directory

## Resume Protocol

### When to Resume
Resume is triggered by the `/maestro:resume` command or when `/maestro:orchestrate` detects an existing active session.

### Resume Steps

1. **Read State**: Read state via run_shell_command: `node ${extensionPath}/scripts/read-state.js <MAESTRO_STATE_DIR>/state/active-session.md` (resolve `MAESTRO_STATE_DIR`, default: `.gemini`)
2. **Parse Frontmatter**: Extract YAML frontmatter for session metadata
3. **Identify Position**: Determine:
   - Last completed phase (highest ID with `status: completed`)
   - Current active phase (first phase with `status: in_progress` or `pending`)
   - Any failed phases with unresolved errors
4. **Check Errors**: Identify unresolved errors from previous execution
5. **Present Summary**: Display status summary to user using the resume format defined in GEMINI.md
6. **Handle Errors**: If unresolved errors exist:
   - Present each error with context
   - Offer options: retry, skip, abort, or adjust parameters
   - Wait for user guidance before proceeding
7. **Continue Execution**: Resume from the first pending or failed phase
8. **Update State**: Mark resumed phase as `in_progress` and update timestamps

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
