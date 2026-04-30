---
name: implementation-planning
description: Generates detailed implementation plans from finalized designs
---

# Implementation Planning Skill

**Standard workflow only.** If `task_complexity` is `simple` and workflow mode is Express, do not activate this skill. Simple tasks use the Express workflow, which does not activate implementation-planning. Return to the Express Workflow section.

Activate this skill during Phase 2 of Maestro orchestration, after the design document has been approved. This skill provides the methodology for generating detailed, actionable implementation plans that map directly to subagent assignments.

## Codebase Grounding

Do not generate an implementation plan from guesses about the repository.

Use the built-in `codebase_investigator` before phase decomposition when:
- The task modifies an existing codebase
- File ownership, integration points, or validation commands are still unclear after reading the approved design
- Parallelization decisions depend on understanding current module boundaries or likely file overlap

Ask the investigator for:
- The modules and files most likely to change
- Existing architectural boundaries and conventions the plan must preserve
- Integration seams, dependencies, and shared ownership hotspots
- Validation commands and test entry points already used by the project
- Parallelization or conflict risks that should prevent batching

Skip the investigator only for greenfield tasks, documentation-only work, or plans where the current turn already established the relevant repo structure from direct reads.

Reuse investigator findings directly in the implementation plan:
- File inventories should reflect real candidate paths, not placeholders
- Validation criteria should prefer repo-native commands the investigator surfaced
- Parallel batches should account for actual ownership overlap and conflict risk

## Plan Generation Methodology

### Input Analysis
Before generating the plan, thoroughly analyze the approved design document for:
- Read `task_complexity` from the approved design document's frontmatter. Apply phase count guidance and domain analysis scaling accordingly. Record `task_complexity` in implementation plan frontmatter.
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
5. **Agent Capability Match**: Verify the assigned agent's tool tier supports the phase deliverables (see compatibility check below)
6. **Testability**: Each phase should be independently validatable

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

### Agent-Deliverable Compatibility Check

Before finalizing agent assignments, verify each phase's agent can deliver its requirements:

| Phase Deliverable | Required Tier | Compatible Agents |
|-------------------|--------------|-------------------|
| Creates/modifies files | Full Access or Read+Write | analytics-engineer, cobol-engineer, coder, copywriter, data-engineer, design-system-engineer, devops-engineer, hlasm-assembler-specialist, i18n-specialist, ibm-i-specialist, integration-engineer, ml-engineer, mlops-engineer, mobile-engineer, observability-engineer, platform-engineer, product-manager, prompt-engineer, refactor, release-manager, technical-writer, tester, ux-designer |
| Runs shell commands | Full Access or Read+Shell | accessibility-specialist, analytics-engineer, cobol-engineer, coder, data-engineer, database-administrator, db2-dba, debugger, design-system-engineer, devops-engineer, hlasm-assembler-specialist, i18n-specialist, ibm-i-specialist, integration-engineer, ml-engineer, mlops-engineer, mobile-engineer, observability-engineer, performance-engineer, platform-engineer, refactor, security-engineer, seo-specialist, site-reliability-engineer, tester, zos-sysprog |
| Analysis/review only | Any tier | All agents |

<HARD-GATE>
Read-Only agents (architect, api-designer, cloud-architect, code-reviewer, compliance-reviewer, content-strategist, solutions-architect)
CANNOT be assigned to phases that create or modify files. If a phase requires file creation
and domain expertise from a Read-Only agent, split it: the Read-Only agent produces a spec
or analysis, then a write-capable agent (typically coder) implements the files based on that output.
</HARD-GATE>

### Phase Count Guidance

Scale decomposition granularity to `task_complexity` (read from design document frontmatter):
- **simple**: 1-3 phases. Prefer single-phase execution when feasible. Combine foundation + implementation. Skip separate documentation/polish phases.
- **medium**: 3-5 phases. Use the layer model but combine Quality and Documentation into the final implementation phase where practical.
- **complex**: No phase count cap. Full layer decomposition strategy applies.

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

### Dependency Minimization

List only **direct** blockers in `blocked_by`. Do not include transitive dependencies — they inflate dependency depth and prevent parallelism.

Anti-pattern (over-specified):
- Phase 2: blocked_by: [1]
- Phase 3: blocked_by: [1, 2] — Phase 1 is redundant, already reachable via Phase 2
- Phase 4: blocked_by: [1, 2, 3] — Phases 1, 2 are redundant

Result: depths 0, 1, 2, 3 — zero parallel phases.

Correct (minimized):
- Phase 2: blocked_by: [1]
- Phase 3: blocked_by: [1] — Only needs Phase 1 output, not Phase 2
- Phase 4: blocked_by: [2, 3] — Needs both done

Result: depths 0, 1, 2 — Phases 2 and 3 run in parallel at depth 1.

Ask for each dependency: "Does this phase truly need the output of that specific phase, or is it transitively covered?"

If `validate_plan` is available, review its `parallelization_profile` and `redundant_dependency` warnings before presenting the plan. Revise `blocked_by` to eliminate redundancies when possible.

## Agent Assignment Criteria

### Matching Tasks to Agents

| Task Domain | Primary Agent | Secondary Agent | Rationale |
|-------------|--------------|-----------------|-----------|
| System design, architecture | `architect` | - | Read-only analysis, design expertise |
| Cloud architecture, multi-region topology | `cloud-architect` | `devops-engineer` | Architecture first, implementation second |
| Enterprise integration architecture | `solutions-architect` | `integration-engineer` | Cross-team design before implementation |
| API contracts, endpoints | `api-designer` | `coder` | Design then implement |
| Feature implementation | `coder` | - | Full implementation access |
| Code quality review | `code-reviewer` | - | Read-only verification |
| Database schema, queries | `data-engineer` | - | Schema + implementation |
| RDBMS tuning, indexes, migration safety | `database-administrator` | `data-engineer` | DBA analysis before schema/code changes |
| DB2 administration | `db2-dba` | `data-engineer` | DB2-specific operations and design |
| Bug investigation | `debugger` | - | Read + shell for investigation |
| CI/CD, infrastructure | `devops-engineer` | - | Full DevOps access |
| Internal platforms, paved paths | `platform-engineer` | `devops-engineer` | Platform conventions and implementation |
| B2B integrations, ETL, message brokers | `integration-engineer` | - | Full integration implementation |
| SLOs, runbooks, reliability | `site-reliability-engineer` | `observability-engineer` | Reliability assessment plus telemetry implementation |
| Observability, metrics, traces | `observability-engineer` | - | Full telemetry implementation |
| Performance analysis | `performance-engineer` | - | Read + shell for profiling |
| Code restructuring | `refactor` | - | Write + shell access (for validation) |
| Security assessment | `security-engineer` | - | Read + shell for scanning |
| Test creation | `tester` | - | Full test implementation |
| Documentation | `technical-writer` | - | Write access for docs |
| Release notes, changelogs, rollout | `release-manager` | - | Write access for release artifacts |
| Technical SEO audit | `seo-specialist` | - | Read + shell + web search |
| Marketing copy, content | `copywriter` | - | Read/write |
| Content planning | `content-strategist` | - | Read + web search/fetch |
| UX design, user flows | `ux-designer` | - | Read/write + web search |
| WCAG compliance audit | `accessibility-specialist` | - | Read + shell + web search |
| Requirements, product | `product-manager` | - | Read/write + web search |
| Tracking, analytics | `analytics-engineer` | `coder` | Implement then instrument |
| Internationalization | `i18n-specialist` | `coder` | Implement then localize |
| Design tokens, theming | `design-system-engineer` | `coder` | Tokens then consume |
| Legal, regulatory | `compliance-reviewer` | - | Read + web search/fetch |
| Mobile platform work | `mobile-engineer` | `tester` | Mobile implementation plus validation |
| Model training, inference integration | `ml-engineer` | `tester` | ML implementation plus evaluation |
| Model registry, drift, model CI/CD | `mlops-engineer` | `devops-engineer` | Model operations and deployment |
| Prompt design, few-shot, RAG tuning | `prompt-engineer` | `coder` | Prompt spec before integration |
| Mainframe COBOL, JCL, CICS/IMS | `cobol-engineer` | `tester` | Mainframe implementation and validation |
| IBM HLASM for z/OS | `hlasm-assembler-specialist` | - | Assembly implementation |
| IBM i RPG/CL, DB2 for i | `ibm-i-specialist` | - | IBM i implementation |
| z/OS systems programming, JCL, RACF | `zos-sysprog` | `security-engineer` | System-level analysis and controls |

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

### Resource Estimation

Do not invent provider pricing or model tiers. Agent model selection is runtime-owned through agent frontmatter and runtime configuration. Estimate execution size in stable, codebase-derived terms instead:

- **Input complexity**: number of files likely to be read, average file size, and prior-phase context
- **Output complexity**: number of files created or modified, validation output volume, and expected handoff detail
- **Retry budget**: note phases likely to need retries because of broad file ownership, external dependencies, or uncertain validation

Include a lightweight plan-level resource summary when useful:

| Phase | Agent | Est. Files Read | Est. Files Written | Retry Risk | Notes |
|-------|-------|-----------------|--------------------|------------|-------|
| 1 | [agent] | [N] | [N] | LOW/MEDIUM/HIGH | [why] |

## Plan Document Generation

### Output Location

The write path depends on whether your runtime provides a Plan Mode surface (check `get_runtime_context`, loaded at session start, step 0).

- **Plan Mode active**: Some runtimes restrict writes to a temporary staging directory during Plan Mode. Write the plan there first, then copy to the permanent location after approval. Call `exit_plan_mode` with the plan path to present the plan for user approval.
- **Plan Mode not active or not available**: Write the implementation plan directly to the project's plans directory.

Permanent location: `<state_dir>/plans/YYYY-MM-DD-<topic-slug>-impl-plan.md` (where `<state_dir>` resolves from `MAESTRO_STATE_DIR`, default `docs/maestro`).

If your runtime does not provide a Plan Mode transition, track planning progress using the plan-update mechanism from your runtime context, write directly to the final location, and use the user-prompt tool from runtime context for the approval gate.

### Document Structure
Use the `implementation-plan` template loaded via `get_skill_content`.

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

   Note: Native parallel execution currently runs agents in autonomous mode.
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

Before presenting the plan for approval, check whether `validate_plan` appears in your available tools. If it does, call it with the plan structure and `task_complexity` to verify phase count constraints, file ownership, acyclic dependencies, and agent validity. If it does not, self-check against the phase count limits above.

### Post-Generation
After writing the implementation plan:
1. Confirm the file path to the user
2. Present the dependency graph and execution strategy
3. Highlight parallel execution opportunities
4. Provide resource estimates when useful
5. If your runtime provides Plan Mode, call `exit_plan_mode` with the plan path to present the plan for user approval. If Plan Mode is not available, present the completed plan for user approval using the user-prompt tool from runtime context.
6. Ensure the approved plan is at `<state_dir>/plans/YYYY-MM-DD-<slug>-impl-plan.md` as the permanent project reference (copy from the staging directory if Plan Mode was used)
7. Ask if the user is ready to proceed to execution (Phase 3)
8. Upon approval, create the session state file via the session-management skill
