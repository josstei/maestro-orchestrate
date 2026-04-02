---
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

- `maestro-orchestrate`: full design -> plan -> execute workflow
- `maestro-execute`: execute an approved implementation plan
- `maestro-resume`: resume the active Maestro session
- `maestro-status`: summarize the active Maestro session without mutating state
- `maestro-archive`: archive the active Maestro session
- `maestro-review`: standalone code review
- `maestro-debug`: focused debugging workflow
- `maestro-security-audit`: standalone security assessment
- `maestro-perf-check`: standalone performance assessment
- `maestro-seo-audit`: standalone SEO assessment
- `maestro-a11y-audit`: standalone accessibility compliance check
- `maestro-compliance-check`: standalone legal/regulatory review

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

When a workflow phase says "Activate `<skill>`", read the skill file from `${CLAUDE_PLUGIN_ROOT}/skills/` using the `Read` tool and follow its full methodology. Do not skip this step — the methodology files contain the structured questions, formats, and protocols that each phase requires.

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
