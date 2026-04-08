# Maestro Orchestration Flow

The orchestration workflow is defined by 40 steps in `src/references/orchestration-steps.md`. Two modes exist: **Standard** (medium/complex tasks) and **Express** (simple tasks).

## Standard Workflow

```
┌─────────────────────────────────────────────────┐
│                   STARTUP                       │
│  Turn 1: get_runtime_context → resolve_settings │
│          → initialize_workspace → check session │
│          → assess_task_complexity                │
│          → STOP (no output in Turn 1)           │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│               CLASSIFICATION                    │
│  Turn 2: Load architecture reference            │
│          Classify: simple / medium / complex     │
│          Route: simple → Express, else → Design │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│            PHASE 1: DESIGN                      │
│  Load design-dialogue skill                     │
│  Structured conversation (depth: quick/std/deep)│
│  Present sections one-at-a-time for approval    │
│  Write design document to state_dir/plans/      │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│            PHASE 2: PLANNING                    │
│  Load implementation-planning skill             │
│  Generate phased plan with dependencies         │
│  HARD-GATE: validate_plan before presenting     │
│  User approval: Approve / Revise / Abort        │
│  Write plan to state_dir/plans/                 │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│            PHASE 3: EXECUTION                   │
│  Load execution + delegation skills             │
│  Execution Mode Gate: parallel / sequential     │
│  Create session via MCP                         │
│  For each phase:                                │
│    → get_agent for methodology                  │
│    → Delegate with protocols + context chain    │
│    → Parse Task Report + Downstream Context     │
│    → transition_phase (HARD-GATE per phase)     │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│            PHASE 4: COMPLETION                  │
│  Load code-review skill                         │
│  Delegate to code-reviewer (if non-doc changes) │
│  HARD-GATE: Block on Critical/Major findings    │
│  Archive session (if MAESTRO_AUTO_ARCHIVE)      │
│  Present final summary                          │
└─────────────────────────────────────────────────┘
```

## Express Workflow

For simple tasks (1 phase, 1 agent):

```
CLASSIFICATION → simple
  │
  ▼
Ask 1-2 clarifying questions
  │
  ▼
Present structured brief → User approval (HARD-GATE)
  │
  ▼
Create session (workflow_mode="express", 1 phase)
  │
  ▼
Delegate to single agent
  │
  ▼
Parse Task Report → transition_phase (HARD-GATE)
  │
  ▼
Code review → HARD-GATE on Critical/Major
  │
  ▼
Archive session → Present summary
```

## Execution Modes

### Sequential

Phases execute one at a time in dependency order:

1. Verify blocked_by dependencies completed
2. Mark phase in_progress
3. Delegate to assigned agent
4. Parse handoff → update state
5. Mark completed → advance to next

### Parallel (Native)

Phases at the same dependency depth execute concurrently:

1. Compute dependency DAG → identify parallel batches
2. For each batch:
   - Verify all blocking phases complete
   - Slice by `MAESTRO_MAX_CONCURRENT` (0 = all)
   - Emit contiguous agent calls in single turn
   - Runtime parallelizes the calls
3. All batch members must complete before next batch

### Execution Mode Gate

Determines parallel vs. sequential:

1. If `MAESTRO_EXECUTION_MODE=parallel/sequential` → use directly
2. If `MAESTRO_EXECUTION_MODE=ask` (default):
   - If ≤1 parallel-eligible phase → auto-select sequential
   - If >50% parallel → recommend parallel
   - Otherwise → recommend sequential
   - Prompt user with recommendation

## Delegation Flow

```
Orchestrator                          Agent
    │                                   │
    ├── get_agent("coder") ──────────►  │
    │◄── methodology + tools ──────────┤
    │                                   │
    ├── Construct prompt:               │
    │   - agent-base-protocol           │
    │   - filesystem-safety-protocol    │
    │   - Task description              │
    │   - Progress context              │
    │   - File lists (create/modify)    │
    │   - Downstream consumer info      │
    │   - Tool restrictions             │
    │   - Validation commands           │
    │                                   │
    ├── Delegate ──────────────────────►│
    │                                   │
    │                                   ├── Step 1: Anchor to project
    │                                   ├── Step 2: Scope verification
    │                                   ├── Step 3: Convention extraction
    │                                   ├── ... (task work) ...
    │                                   ├── Run validation
    │                                   │
    │◄── ## Task Report ───────────────┤
    │◄── ## Downstream Context ────────┤
    │                                   │
    ├── Parse handoff                   │
    ├── transition_phase()              │
    └── Feed context to next phase      │
```

## Context Chain

Information flows between phases via the Downstream Context:

```
Phase 1 (architect)
  └── Downstream Context:
      - Key Interfaces: UserService interface at src/services/user.ts
      - Patterns: Repository pattern for data access
      - Integration Points: /api/users endpoint
      │
      ▼
Phase 2 (coder) receives:
  - Phase 1's downstream context in prompt
  - Files created by Phase 1
  - Accumulated patterns
```

Each agent's handoff report contains:

**Task Report**: status, files created/modified/deleted, decisions, validation result, errors, scope deviations

**Downstream Context**: key interfaces introduced, patterns established, integration points, assumptions, warnings

## Session Lifecycle

```
                ┌──────────┐
                │  (none)  │
                └────┬─────┘
                     │ create_session
                     ▼
                ┌──────────┐
         ┌──────│ active   │──────┐
         │      └────┬─────┘      │
         │           │            │
    resume│    transition_phase   │ archive
         │           │            │
         │      ┌────▼─────┐      │
         └──────│ active   │──────┤
                └──────────┘      │
                                  ▼
                           ┌──────────┐
                           │ archived │
                           └──────────┘
```

## Hard Gates

Non-negotiable checkpoints that block progression:

| Gate | Location | Condition |
|------|----------|-----------|
| Tech recommendations | Step 11 | Must recommend vanilla HTML/CSS/JS for static delivery unless framework explicitly required |
| Design sections | Step 12 | Each section presented individually and approved |
| validate_plan | Step 16 | Plan must pass validation before user sees it |
| Execution mode | Step 19 | Must present only Parallel and Sequential options |
| Agent dispatch | Step 23 | Must dispatch by agent's registered tool directly |
| transition_phase | Step 25 | Must be called individually for EVERY completed phase |
| Code review | Step 28 | Critical/Major findings block completion |
| archive_session | Step 29 | Must archive if MAESTRO_AUTO_ARCHIVE=true |
| Express 1-phase | Step 31 | Express sessions must have exactly one phase |
| Express questions | Step 32 | Each question must use user prompt tool |
| Express brief | Step 33 | Must present as plain text + separate approval prompt |
| Express rejection | Step 34 | Second rejection escalates to Standard workflow |
| Express agent | Step 36 | Must delegate by specific agent tool, not generalist |
| Express review | Step 38 | Re-delegate on Critical/Major findings (1 retry) |

## Error Handling

- Max retries per phase: `MAESTRO_MAX_RETRIES` (default: 2)
- First failure: analyze, adjust context, retry automatically
- Limit exceeded: mark failed, escalate to user
- File conflicts: stop immediately, ask user
- Timeout/termination: record partial output, retry or escalate

## Recovery

When flow breaks:
- Moved too fast → return to most recent unanswered gate
- User asks for implementation before approval → remind them Maestro requires approval first
- User asks to skip execution-mode → remind them it's required
- Answer invalidates prior choice → restate assumption, re-run gate
- Delegation collapses → return to execution setup or re-scope

## Resume

When resuming an interrupted session:
1. Read active session state
2. Identify: last completed phase, current phase, failed phases
3. Check for unresolved errors
4. Present summary to user
5. Handle errors: retry/skip/abort/adjust
6. Continue from pending/failed phase

Express resume follows the same pattern but maps to Express steps based on phase status.
