---
name: orchestrate
description: Run the full Maestro workflow for complex engineering tasks that need a mandatory design dialogue, approved implementation plan, and then execution with shared session state
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - Skill
  - EnterPlanMode
  - ExitPlanMode
---

**REQUIRED: Read the orchestrator instructions below before any action.**

## Runtime: Claude Code

This preamble maps generic step references to Claude Code tool syntax.

| Action | How |
|--------|-----|
| Load skill | `Read ${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` |
| Load reference/template | `Read ${CLAUDE_PLUGIN_ROOT}/references/<name>.md` or `${CLAUDE_PLUGIN_ROOT}/templates/<name>.md` |
| Delegate to agent | `Agent(subagent_type: "maestro:<name>", prompt: "...")` |
| MCP tools | `mcp__plugin_maestro_maestro__<tool_name>` |
| Enter Plan Mode | `EnterPlanMode` — if unavailable, continue with `AskUserQuestion` for approvals. |
| Exit Plan Mode | `ExitPlanMode` with plan path |
| User prompt (choose) | `AskUserQuestion` with options |
| User prompt (approve) | `AskUserQuestion` with yes/no |
| Agent name prefix | All agent names require `maestro:` prefix (e.g., `maestro:coder`) |

## MCP Tool Name Mapping

Maestro provides MCP tools via a plugin-scoped MCP server. In Claude Code, these tools are registered with a namespace prefix. When skills or instructions reference bare tool names like `initialize_workspace` or `resolve_settings`, look for the actual tool name with a `mcp__` prefix pattern (e.g., `mcp__plugin_maestro_maestro__initialize_workspace`). The mapping:

| Referenced as | Actual tool name |
|--------------|-----------------|
| `initialize_workspace` | `mcp__plugin_maestro_maestro__initialize_workspace` |
| `resolve_settings` | `mcp__plugin_maestro_maestro__resolve_settings` |
| `assess_task_complexity` | `mcp__plugin_maestro_maestro__assess_task_complexity` |
| `get_session_status` | `mcp__plugin_maestro_maestro__get_session_status` |
| `create_session` | `mcp__plugin_maestro_maestro__create_session` |
| `update_session` | `mcp__plugin_maestro_maestro__update_session` |
| `transition_phase` | `mcp__plugin_maestro_maestro__transition_phase` |
| `archive_session` | `mcp__plugin_maestro_maestro__archive_session` |
| `validate_plan` | `mcp__plugin_maestro_maestro__validate_plan` |
| `get_skill_content` | N/A — Claude uses `Read` tool directly for skill/reference loading |

When any skill says "If `X` appears in your available tools, call it", search your available tools for the prefixed version.

## Agent Name Mapping

Maestro agents are registered in Claude Code with a `maestro:` namespace prefix. When delegating to agents via the `Agent` tool, ALWAYS use the prefixed name. Bare names like `coder` will fail with "Agent type not found."

| Referenced as | Use with Agent tool |
|--------------|-------------------|
| `coder` | `maestro:coder` |
| `code-reviewer` | `maestro:code-reviewer` |
| `architect` | `maestro:architect` |
| `tester` | `maestro:tester` |
| `debugger` | `maestro:debugger` |
| `refactor` | `maestro:refactor` |
| `security-engineer` | `maestro:security-engineer` |
| `performance-engineer` | `maestro:performance-engineer` |
| `data-engineer` | `maestro:data-engineer` |
| `devops-engineer` | `maestro:devops-engineer` |
| `technical-writer` | `maestro:technical-writer` |
| `api-designer` | `maestro:api-designer` |
| `ux-designer` | `maestro:ux-designer` |
| `design-system-engineer` | `maestro:design-system-engineer` |
| `product-manager` | `maestro:product-manager` |
| `content-strategist` | `maestro:content-strategist` |
| `copywriter` | `maestro:copywriter` |
| `seo-specialist` | `maestro:seo-specialist` |
| `accessibility-specialist` | `maestro:accessibility-specialist` |
| `compliance-reviewer` | `maestro:compliance-reviewer` |
| `i18n-specialist` | `maestro:i18n-specialist` |
| `analytics-engineer` | `maestro:analytics-engineer` |

**Rule:** When dispatching ANY agent, prepend `maestro:` to the agent name. This applies to all delegation — Express workflow, Standard workflow, code review, and fix re-delegation.

## Skill Entry Points

Prefer these bundled entry-point skills:

- `orchestrate`: full design -> plan -> execute workflow
- `execute`: execute an approved implementation plan
- `resume`: resume the active Maestro session
- `status`: summarize the active Maestro session without mutating state
- `archive`: archive the active Maestro session
- `review`: standalone code review
- `debug`: focused debugging workflow
- `security-audit`: standalone security assessment
- `perf-check`: standalone performance assessment
- `seo-audit`: standalone SEO assessment
- `a11y-audit`: standalone accessibility compliance check
- `compliance-check`: standalone legal/regulatory review

## Settings Reference

| Setting | envVar | Default | Usage |
| --- | --- | --- | --- |
| Disabled Agents | `MAESTRO_DISABLED_AGENTS` | none | Exclude agents from assignment |
| Max Retries | `MAESTRO_MAX_RETRIES` | `2` | Phase retry limit |
| Auto Archive | `MAESTRO_AUTO_ARCHIVE` | `true` | Auto archive on success |
| Validation | `MAESTRO_VALIDATION_STRICTNESS` | `normal` | Validation gating mode |
| State Directory | `MAESTRO_STATE_DIR` | `docs/maestro` | Session and plan state root |
| Max Concurrent | `MAESTRO_MAX_CONCURRENT` | `0` | Parallel batch chunk size (`0` means dispatch the entire ready batch) |
| Execution Mode | `MAESTRO_EXECUTION_MODE` | `ask` | Execute phase mode selection (`ask`, `parallel`, `sequential`) |

## Skill Loading

When a workflow step says "Load the `<skill>` skill", read the skill file from `${CLAUDE_PLUGIN_ROOT}/skills/` using the `Read` tool and follow its full methodology. Do not skip this step — the methodology files contain the structured questions, formats, and protocols that each phase requires.

| Skill | File |
| --- | --- |
| `design-dialogue` | `${CLAUDE_PLUGIN_ROOT}/skills/design-dialogue/SKILL.md` |
| `implementation-planning` | `${CLAUDE_PLUGIN_ROOT}/skills/implementation-planning/SKILL.md` |
| `execution` | `${CLAUDE_PLUGIN_ROOT}/skills/execution/SKILL.md` |
| `delegation` | `${CLAUDE_PLUGIN_ROOT}/skills/delegation/SKILL.md` |
| `session-management` | `${CLAUDE_PLUGIN_ROOT}/skills/session-management/SKILL.md` |
| `code-review` | `${CLAUDE_PLUGIN_ROOT}/skills/code-review/SKILL.md` |
| `validation` | `${CLAUDE_PLUGIN_ROOT}/skills/validation/SKILL.md` |

## Task Complexity Classification

Before beginning any workflow, classify the task as `simple`, `medium`, or `complex`. This classification controls workflow mode selection and, for Standard workflow, design depth, question coverage, section count, phase limits, and domain analysis scope.

Check whether `assess_task_complexity` appears in your available tools. If it does, call it to get factual repo signals, then apply the heuristics below to those signals plus the task description. If it does not, classify from the task description alone.

**Heuristics:**

| Signal | Simple | Medium | Complex |
|--------|--------|--------|---------|
| Scope | Single concern, few files | Multi-component, clear boundaries | Cross-cutting, multi-service |
| Examples | Static sites, config changes, single-file scripts, CLI tools | API endpoints, feature additions, integrations, CRUD apps | New subsystems, refactors spanning modules, multi-service architectures |
| Greenfield | Empty or near-empty repo | Small existing codebase | Large codebase with established patterns |

**Downstream behavior:**

| Dimension | Simple | Medium | Complex |
|-----------|--------|--------|---------|
| Depth recommendation | Quick (auto-selected, user can override) | Standard (recommended) | Standard or Deep |
| Design sections | 3 minimum | 4-5 sections | All 7 |
| Max phases | 3 | 5 | No cap |
| Domain analysis | Engineering only | Engineering + relevant | Full 8-domain |
| Question areas | Area 1 only | Areas 1-3 | All 5 |

Present the classification and rationale before proceeding. The user can override.

Record `task_complexity` in design document frontmatter alongside `design_depth`. For Express workflow (where no design document is created), `task_complexity` is recorded in session state only via the `create_session` MCP call.

The classification result also gates workflow mode selection via the workflow router below. `simple` tasks enter the Express workflow; `medium` and `complex` tasks enter the Standard workflow.

### Domain Analysis

Before decomposing into phases, assess the task across all capability domains.
For each domain, determine if the task has needs that warrant specialist involvement:

| Domain | Signal questions | Candidate agents |
| --- | --- | --- |
| Engineering | Does the task involve code, infrastructure, or data? | `architect`, `api-designer`, `coder`, `code-reviewer`, `tester`, `refactor`, `data-engineer`, `debugger`, `devops-engineer`, `performance-engineer`, `security-engineer`, `technical-writer` |
| Product | Are requirements unclear, or does success depend on user outcomes? | `product-manager` |
| Design | Does the deliverable have a user-facing interface or interaction? | `ux-designer`, `accessibility-specialist`, `design-system-engineer` |
| Content | Does the task produce or modify user-visible text, copy, or media? | `content-strategist`, `copywriter` |
| SEO | Is the deliverable web-facing and discoverable by search engines? | `seo-specialist` |
| Compliance | Does the task handle user data, payments, or operate in a regulated domain? | `compliance-reviewer` |
| Internationalization | Must the deliverable support multiple locales? | `i18n-specialist` |
| Analytics | Does success need to be measured, or does the feature need instrumentation? | `analytics-engineer` |

Skip domains where the answer is clearly "no." For relevant domains, include appropriate agents in the phase plan alongside engineering agents. Domain agents participate at whatever phase makes sense — design, implementation, or post-build audit — based on the specific task.

Apply domain analysis proportional to `task_complexity`:
- `simple`: Engineering domain only. Skip other domains unless explicitly requested.
- `medium`: Engineering + domains with clear signals from the task description.
- `complex`: Full 8-domain sweep (current behavior).

## Agent Roster

| Agent | Focus | Key Tool Profile |
| --- | --- | --- |
| `architect` | System design | Read tools + web search/fetch |
| `api-designer` | API contracts | Read tools + web search/fetch |
| `code-reviewer` | Code quality review | Read-only |
| `coder` | Feature implementation | Read/write/shell + todos + skill activation |
| `data-engineer` | Schema/data/queries | Read/write/shell + todos + web search |
| `debugger` | Root cause analysis | Read + shell + todos |
| `devops-engineer` | CI/CD and infra | Read/write/shell + todos + web search/fetch |
| `performance-engineer` | Performance profiling | Read + shell + todos + web search/fetch |
| `refactor` | Structural refactoring | Read/write/shell + todos + skill activation |
| `security-engineer` | Security auditing | Read + shell + todos + web search/fetch |
| `technical-writer` | Documentation | Read/write + todos + web search |
| `tester` | Test implementation | Read/write/shell + todos + skill activation + web search |
| `seo-specialist` | Technical SEO auditing | Read + shell + web search/fetch + todos |
| `copywriter` | Marketing copy & content | Read/write |
| `content-strategist` | Content planning & strategy | Read + web search/fetch |
| `ux-designer` | User experience design | Read/write + web search |
| `accessibility-specialist` | WCAG compliance auditing | Read + shell + web search + todos |
| `product-manager` | Requirements & product strategy | Read/write + web search |
| `analytics-engineer` | Tracking & measurement | Read/write/shell + web search + todos |
| `i18n-specialist` | Internationalization | Read/write/shell + todos |
| `design-system-engineer` | Design tokens & theming | Read/write/shell + todos + skill activation |
| `compliance-reviewer` | Legal & regulatory compliance | Read + web search/fetch |

## Execute

Read `${CLAUDE_PLUGIN_ROOT}/references/orchestration-steps.md` and follow the returned step sequence exactly. The steps are the sole procedural authority — do not improvise, skip, or reorder them.

---

# Maestro Orchestrate

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`, `${CLAUDE_PLUGIN_ROOT}/templates/design-document.md`, `${CLAUDE_PLUGIN_ROOT}/templates/implementation-plan.md`, and `${CLAUDE_PLUGIN_ROOT}/templates/session-state.md` before starting.

## Workflow Routing

<HARD-GATE>
After startup checks, classify task complexity per the complexity-classification fragment in the orchestrator template.

- If `simple`: follow the Express Workflow section from the orchestrator template. Do NOT continue reading the sections below — skip the Hard Gates, First-Turn Contract, Design Phase Behavior, Planning Phase Behavior, and Execution Mode Gate entirely. Go directly to Express Flow.
- If `medium` or `complex`: continue with the Standard Workflow sections below.

Do not present design depth selectors, design questions, or plan approval gates for `simple` tasks. Those are Standard workflow only.
</HARD-GATE>

## Hard Gates (Standard Workflow Only)

1. Do not start implementation on the first turn.
2. Do not edit project files during orchestration until the user has approved an implementation plan.
3. Start with design discovery questions unless the repository inspection already answers them and no high-impact ambiguity remains.
4. Ask one structured question at a time when clarifying scope, constraints, and success criteria.
5. Every design or planning question must use `AskUserQuestion with options`.
6. After the design is clear, present a written design summary for approval.
7. After the design is approved, present a written implementation plan for approval.
8. Resolve the execution-mode gate after plan approval and before any implementation delegation begins.
9. Only after plan approval and execution-mode selection may execution begin.
10. Execute implementation through child agents unless the user explicitly approves a main-context fallback.

## First-Turn Contract (Standard Workflow Only)

On the first turn, do exactly this:

1. Summarize the task in 1-2 sentences using repo-grounded context when available.
2. State that Maestro will stay in design/planning until the plan is approved.
3. Ask exactly one structured question with 2-4 numbered options — on the first orchestration turn this is the design depth selector (Quick/Standard/Deep), followed by design questions on subsequent turns.

Do not do any of the following on the first turn:

- propose implementation steps
- spawn agents
- edit project files
- present a completed design
- present a completed implementation plan

## Workflow

1. Resolve `docs/maestro` from `MAESTRO_STATE_DIR`.
2. If `initialize_workspace` appears in your available tools, call it. Otherwise, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-workspace.js docs/maestro`. Do this before writing plan or session files.
3. If `docs/maestro/state/active-session.md` already exists, summarize it and offer to resume or archive before starting a new orchestration.
4. Ground the task in the repository before asking high-impact questions.
5. Run the four Maestro phases:
   - Design
   - Plan
   - Execute
   - Complete
6. Write approved design and implementation plan documents into `docs/maestro/plans/` using the shared templates.
7. Create or update active session state using `${CLAUDE_PLUGIN_ROOT}/templates/session-state.md`.
8. Resolve the execution mode from `MAESTRO_EXECUTION_MODE` or the execution-mode picker after plan approval.
9. Execute the approved plan through child agents using the selected execution mode.

## Design Phase Behavior

- Inspect the relevant codebase slice before asking the first high-impact question.
- Ask one question at a time.
- Ask with 2-4 explicit options whenever a user choice would materially affect design or planning.
- Use `AskUserQuestion with options` instead of plain text numbering.
- Put the recommended option first.
- If `AskUserQuestion with options` is unavailable in the active runtime, stop and tell the user that native picker support is unavailable.
- Cover scope, constraints, integration points, success criteria, and what is out of scope.
- If a user answer materially changes architecture or implementation order, reflect that in the design before moving on.
- Present the design as a concrete summary and ask for explicit approval before planning.
- Use the required question order below unless repository facts eliminate one category.

Use this format for choice questions:

```text
[Topic]: [Question]

1. [Recommended option] (Recommended) - [Why this is the default]
2. [Option] - [Tradeoff]
3. [Option] - [Tradeoff]

Reply with the option number or label.
```

Avoid open-ended questions when a bounded selection is possible. Use open-ended questions only when predefined options would be misleading.

Use this format for the first question (the depth selector):

```text
I'll start Maestro's design phase. I'll stay in design and planning until you approve the implementation plan. First, choose the design depth for this session.

Design Depth: How much reasoning rigour should Maestro apply during design?

1. Standard (Recommended) - Assumption surfacing, decision matrix, rationale annotations. The default for most work.
2. Quick - Current behavior, no enrichment. Fast when you already have clarity.
3. Deep - Full treatment with probing, trade-off narration, per-decision alternatives, and requirement traceability. For high-stakes or ambiguous tasks.

Reply with the option number or label.
```

## Required Question Order

The depth selector precedes all design questions. The order below applies to design questions starting from turn 2.

Ask design questions in this order:

1. Scope and boundary
2. Primary integration surface
3. Constraints and compatibility
4. Validation and rollout expectation

Do not skip directly to technology selection or implementation structure before scope and integration are clear.

## Selection Rules

- Each question must offer mutually exclusive options.
- Use 2-4 options only.
- Put the recommended option first and mark it `(Recommended)`.
- Require `AskUserQuestion with options` for these options.
- Keep labels short enough that the user can reply with just the label if preferred.
- Include one-line tradeoffs for every option.
- Do not use an `Other` option; users can still answer free-form if needed.

## Design Approval Gate

When design discovery is complete, present a design summary and end with:

```text
Approve this design before I move to implementation planning?

1. Approve design
2. Revise design

Use the picker to approve or revise the design. If the picker is unavailable, stop and report that limitation instead of continuing with plain text approval.
```

Do not move to planning until the user explicitly approves the design.

## Planning Phase Behavior

- Generate a phase-based implementation plan with dependencies, candidate file ownership, validation commands, and execution strategy.
- Keep execution blocked until the user explicitly approves the plan.
- If the plan is not approved, revise it instead of starting execution.
- Present the plan as a plan review, not as work already underway.

## Plan Approval Gate

After presenting the implementation plan, end with:

```text
Approve this implementation plan before execution begins?

1. Approve plan
2. Revise plan
3. Abort execution

Use the picker to approve, revise, or abort. If the picker is unavailable, stop and report that limitation instead of continuing with plain text approval.
```

Do not interpret silence or a non-approval answer as plan approval.

## Execution Mode Gate

Resolve execution mode immediately after the implementation plan is approved.
Load the `execution` skill and follow its Execution Mode Gate section.
The skill contains the authoritative gate protocol including plan analysis,
recommendation logic, user prompting, and session state recording.

Do not duplicate the gate logic here — the execution skill is the single source of truth.

## Delegation Requirement

- Execution work should be performed by child agents via `Agent`, not by the parent session.
- `sequential` means one child agent handles one approved work package at a time, followed by parent-session validation and state updates.
- `parallel` means the parent session dispatches multiple child agents for the current ready batch in the same execution step when the plan marks those phases as parallel-safe.
- If a parallel-ready batch collapses to a single phase, still delegate that phase to one child agent instead of implementing it directly in the parent session.
- Parent-session work is limited to orchestration, session updates, validation, handoff checks, and conflict resolution unless the user explicitly approves a main-context fallback.
- If no safe child-agent delegation path exists, stop, explain why, and ask whether the user wants to revise the plan or approve a main-context fallback.

## Execution Start Condition

Execution can begin only after all of the following are true:

- the repository has been grounded
- design questions are resolved
- the design summary has been approved
- the implementation plan has been approved
- the execution mode has been resolved and recorded

## Recovery Rules

- If the user says the flow moved too fast, return to the most recent unanswered design or plan gate.
- If the user asks for implementation before design or plan approval, remind them that Maestro requires approval first and continue from the blocked gate.
- If the user asks to skip the execution-mode choice, remind them that Maestro requires an explicit `parallel` or `sequential` decision before delegation unless `MAESTRO_EXECUTION_MODE` already pins the mode.
- If an answer invalidates a prior design or plan choice, restate the updated assumption and re-run the relevant approval gate.
- If delegated execution collapses back into the parent session without explicit fallback approval, stop and return to the execution-mode gate or re-scope the child-agent work packages.
