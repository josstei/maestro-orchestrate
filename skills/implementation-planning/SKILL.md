---
name: implementation-planning
description: Generates detailed implementation plans from finalized designs
---

# Implementation Planning Skill

Activate this skill during Phase 2 of Maestro orchestration, after the design document has been approved. This skill provides the methodology for generating detailed, actionable implementation plans that map directly to subagent assignments.

## Plan Generation Methodology

### Input Analysis
Before generating the plan, thoroughly analyze the approved design document for:
- Components and their responsibilities
- Interfaces and contracts between components
- Data models and their relationships
- External dependencies and integrations
- Technology stack decisions
- Quality requirements that influence implementation order

### Phase Decomposition

Break the implementation into phases following these principles:

1. **Foundation First**: Infrastructure, configuration, and shared types/interfaces come first
2. **Dependencies Flow Downward**: A phase can only depend on phases with lower IDs
3. **Single Responsibility**: Each phase delivers a cohesive unit of functionality
4. **Agent Alignment**: Each phase maps to one or two agent specializations
5. **Testability**: Each phase should be independently validatable

### Phase Ordering Strategy

```
Layer 1: Foundation (types, interfaces, configuration)
    |
Layer 2: Core Domain (business logic, data models)
    |
Layer 3: Infrastructure (database, external services, API layer)
    |
Layer 4: Integration (connecting components, middleware)
    |
Layer 5: Quality (testing, security review, performance)
    |
Layer 6: Documentation & Polish
```

### Parallelization Identification

Phases can run in parallel when:
- They have no shared file dependencies (no overlapping files_created or files_modified)
- They are at the same dependency depth (same layer)
- They do not share data model ownership
- Their validation can run independently

Mark parallel-eligible phases with `parallel: true` and group them into execution batches.

## Implementation Detail Requirements

### Per-Phase Specification

Each phase in the plan must include:

#### Objective
A clear, measurable statement of what this phase delivers.

#### Agent Assignment
Which agent(s) execute this phase, with rationale for selection.

#### Files to Create
For each new file:
- Full relative path from project root
- Purpose and responsibility
- Key interfaces, classes, or functions to define
- Complete type signatures for public APIs

#### Files to Modify
For each existing file:
- Full relative path from project root
- Specific changes required and why
- Expected before/after for critical sections

#### Implementation Details

Provide sufficient detail for the assigned agent to execute without ambiguity:
- Interface definitions with complete type signatures
- Base class contracts with abstract method signatures
- Dependency injection patterns and registration points
- Error handling strategy (error types, propagation, recovery)
- Configuration requirements (environment variables, config files)

#### Validation Criteria
Specific commands to run and expected outcomes:
- Build/compile commands
- Lint/format checks
- Unit test commands
- Integration test commands (if applicable)
- Manual verification steps (if applicable)

#### Dependencies
- `blocked_by`: Phase IDs that must complete before this phase starts
- `blocks`: Phase IDs that cannot start until this phase completes

## Agent Assignment Criteria

### Matching Tasks to Agents

| Task Domain | Primary Agent | Secondary Agent | Rationale |
|-------------|--------------|-----------------|-----------|
| System design, architecture | architect | - | Read-only analysis, design expertise |
| API contracts, endpoints | api-designer | coder | Design then implement |
| Feature implementation | coder | - | Full implementation access |
| Code quality review | code-reviewer | - | Read-only verification |
| Database schema, queries | data-engineer | - | Schema + implementation |
| Bug investigation | debugger | - | Read + shell for investigation |
| CI/CD, infrastructure | devops-engineer | - | Full DevOps access |
| Performance analysis | performance-engineer | - | Read + shell for profiling |
| Code restructuring | refactor | - | Write access, no shell needed |
| Security assessment | security-engineer | - | Read + shell for scanning |
| Test creation | tester | - | Full test implementation |
| Documentation | technical-writer | - | Write access for docs |

### Assignment Rules
1. Match the primary task domain to the agent specialization
2. Consider tool requirements — does the task need shell access? Write access?
3. For parallel phases, assign non-overlapping file ownership to each agent
4. Prefer single-agent phases for clarity; use multi-agent only when distinct specializations are needed
5. Never assign more files to an agent than it can handle within its `max_turns` limit

### Token Budget Estimation
Estimate token consumption per phase based on:
- Number of files to read (input tokens)
- Complexity of output expected (output tokens)
- Agent's max_turns limit as upper bound
- Historical averages: ~500 input tokens per file read, ~200 output tokens per file written

### Cost Estimation

#### Per-Phase Cost Factors
- **Model tier**: Pro agents (~$0.01/1K input, ~$0.04/1K output) vs Flash agents (~$0.001/1K input, ~$0.004/1K output)
- **Input complexity**: Number of files read, average file size, context from previous phases
- **Output complexity**: Lines of code generated, number of files created/modified
- **Retry budget**: Add 50% buffer per phase for potential retries (max 2 retries)

#### Estimation Formula
```
Phase Cost = (input_tokens × input_rate + output_tokens × output_rate) × retry_multiplier
```

Where:
- `input_tokens` = files_to_read × 500 + context_tokens
- `output_tokens` = files_to_write × 200 + validation_output
- `retry_multiplier` = 1.5 (accounts for up to 2 retries)

#### Plan-Level Cost Summary
Include this table in every implementation plan:

| Phase | Agent | Model | Est. Input | Est. Output | Est. Cost |
|-------|-------|-------|-----------|------------|----------|
| 1 | [agent] | [model] | [tokens] | [tokens] | [$X.XX] |
| ... | ... | ... | ... | ... | ... |
| **Total** | | | **[sum]** | **[sum]** | **[$X.XX]** |

## Plan Document Generation

### Output Location

During Plan Mode, `write_file` is restricted to `.md` files within `~/.gemini/tmp/<project>/plans/` (where `<project>` is the CLI's internal project hash). Write the implementation plan there first, then copy to the project archive after approval:

1. **During Plan Mode** (writable): `~/.gemini/tmp/<project>/plans/YYYY-MM-DD-<topic-slug>-impl-plan.md`
2. **After approval** (permanent reference): `<state_dir>/plans/YYYY-MM-DD-<topic-slug>-impl-plan.md` (`<state_dir>` resolves from `MAESTRO_STATE_DIR`, default `.gemini`)

The `exit_plan_mode` tool validates that `plan_path` is within the project's temp plans directory. Always pass the tmp-directory path.

### Document Structure
Use the implementation plan template from `templates/implementation-plan.md`.

### Required Sections

1. **Plan Overview**: Summary of total phases, agents involved, estimated effort
2. **Dependency Graph**: Visual representation showing phase dependencies and parallel opportunities
3. **Execution Strategy Table**: Stage-by-stage breakdown with agent assignments and execution mode
4. **Phase Details**: Full specification for each phase (objective, agent, files, details, validation, dependencies)
5. **File Inventory**: Complete table mapping every file to its phase and purpose
6. **Risk Classification**: Per-phase risk assessment (LOW/MEDIUM/HIGH) with rationale
7. **Execution Profile**: Summary of parallel vs sequential characteristics to inform mode selection:
   ```
   Execution Profile:
   - Total phases: [N]
   - Parallelizable phases: [M] (in [B] batches)
   - Sequential-only phases: [S]
   - Estimated parallel wall time: [time estimate based on batch execution]
   - Estimated sequential wall time: [time estimate based on serial execution]

   Note: Parallel dispatch runs agents in autonomous mode (--approval-mode=yolo).
   All tool calls are auto-approved without user confirmation.
   ```

### Completion Criteria
The implementation plan is complete when:
- Every component from the design document maps to at least one phase
- All phase dependencies are acyclic (no circular dependencies)
- Parallel opportunities are identified and marked
- Each phase has clear validation criteria
- File ownership is non-overlapping for parallel phases
- The user has given explicit approval of the complete plan

### Post-Generation
After writing the implementation plan:
1. Confirm the file path to the user
2. Present the dependency graph and execution strategy
3. Highlight parallel execution opportunities
4. Provide token budget estimates
5. Call `exit_plan_mode` with `plan_path` set to the tmp-directory path (`~/.gemini/tmp/<project>/plans/...`) to present the plan for user approval
6. After approval, copy the plan to `<state_dir>/plans/YYYY-MM-DD-<slug>-impl-plan.md` as a permanent project reference
7. Ask if the user is ready to proceed to execution (Phase 3)
8. Upon approval, create the session state file via the session-management skill
