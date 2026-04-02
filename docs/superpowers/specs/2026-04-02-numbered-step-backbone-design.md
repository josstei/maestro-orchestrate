# Numbered-Step Backbone — Instruction Restructuring

**Task Complexity:** Medium
**Design Depth:** Standard

## 1. Problem Statement

The Maestro orchestrate command delivers behavioral rules through three instruction formats with dramatically different compliance rates:

| Format | Compliance | Examples |
|--------|-----------|----------|
| Numbered steps | ~100% | Startup MCP calls (1-4), phase transitions |
| HARD-GATE blocks | ~90% | Workflow routing, Express phase limit, design section validation |
| Plain text/prose | ~30% | Template reads, technology gate, agent dispatch, section-by-section approval (before HARD-GATE) |

The current command structure mixes all three. Critical behavioral rules are scattered across prose paragraphs, orphaned one-liners, and subsections that the model skips. Each failure requires a retroactive HARD-GATE patch — a whack-a-mole pattern that doesn't scale.

The restructuring converts both the Gemini CLI orchestrate command (`commands/maestro/orchestrate.toml`) and the Claude Code orchestrate command (`claude/commands/orchestrate.md`) to a numbered-step backbone where every action is a step and every constraint is a HARD-GATE inline at the step where it applies. Prose instruction sections are eliminated. The design-dialogue protocol moves out of the Gemini command into its skill file, loaded on demand via `get_skill_content` — matching the Claude version's existing `Activate design-dialogue` pattern.

## 2. Requirements

- Every behavioral rule must be either a numbered step or a HARD-GATE on a step — no prose instructions
- Both Gemini CLI and Claude Code commands must use the same step sequence
- Runtime differences (tool names, skill loading, agent dispatch syntax) isolated to a preamble
- Design-dialogue protocol moves to on-demand loading on Gemini (already on-demand on Claude)
- Technology Recommendation Gate wrapped in HARD-GATE + anti-pattern inline at the design step (step 11). This gate currently lives in the orchestrate commands only, NOT in the design-dialogue skill. It moves to the shared steps file.
- Shared step sequence lives in a single reference file loaded by both runtimes
- No new MCP tools or skills — instruction structure only

## 3. Approach

### Numbered-Step Backbone

Restructure the entire command around a single numbered step list as the sole procedural authority. Remove ALL prose instruction sections. Every action — including behavioral constraints — becomes a step or a HARD-GATE constraint on a step. Nothing exists outside the numbered list except definition tables.

Steps are grouped under phase headers (STARTUP, CLASSIFICATION, DESIGN, PLANNING, EXECUTION SETUP, EXECUTION, COMPLETION, EXPRESS) that break the list into chunks of 3-5 steps each.

### Cross-Runtime Parity via Shared Reference File

The step sequence lives in `references/orchestration-steps.md`. Both runtimes load it:
- Gemini: `get_skill_content(["orchestration-steps"])` — requires adding `orchestration-steps` to the `RESOURCE_ALLOWLIST` in `lib/mcp/handlers/get-skill-content.js` and `mcp/maestro-server.js` (Gemini bundle). Claude does NOT use `get_skill_content` — it reads files directly.
- Claude: `Read ${CLAUDE_PLUGIN_ROOT}/references/orchestration-steps.md`

**Note:** The file `references/orchestration-steps.md` does not exist yet. It is created as part of this design's implementation — it is the primary deliverable, containing the step sequences from Sections 4 and 5.

Each runtime's command file becomes a thin shell: runtime preamble + "load and follow orchestration-steps" + runtime-specific reference tables.

### Runtime Preamble

Each command starts with a preamble that maps generic step language to runtime-specific tool syntax:

**Gemini CLI preamble:**
- Load skill: `get_skill_content(resources: ["<name>"])`
- Load reference/template: `get_skill_content(resources: ["<name>"])`
- Delegate to agent: Call the agent tool by name — `coder(query: "...")`, `tester(query: "...")`
- MCP tools: `mcp_maestro_<tool_name>`
- Enter Plan Mode: `enter_plan_mode` — if unavailable, tell user: "Run `gemini --settings` and set `experimental.plan` to `true`, then restart." Offer to continue without Plan Mode using `ask_user` for approvals.
- Exit Plan Mode: `exit_plan_mode` with `plan_filename`
- User prompt (choose): `ask_user` with `type: 'choice'`
- User prompt (approve): `ask_user` with `type: 'yesno'`

**Claude Code preamble:**
- Load skill: `Read ${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`
- Load reference/template: `Read ${CLAUDE_PLUGIN_ROOT}/references/<name>.md` or `templates/<name>.md`
- Delegate to agent: `Agent(subagent_type: "maestro:<name>", prompt: "...")`
- MCP tools: `mcp__plugin_maestro_maestro__<tool_name>`
- Enter Plan Mode: `EnterPlanMode` — if unavailable, continue with `AskUserQuestion` for approvals.
- Exit Plan Mode: `ExitPlanMode` with plan path
- User prompt (choose): `AskUserQuestion` with options
- User prompt (approve): `AskUserQuestion` with yes/no
- Agent name prefix: All agent names require `maestro:` prefix (e.g., `maestro:coder`)

Steps use generic references ("Load the delegation skill", "Delegate to the assigned agent", "prompt the user to choose") that the preamble resolves. Steps never reference runtime-specific tool names, parameter formats, or CLI commands.

## 4. Step Sequence — Standard Workflow

```
STARTUP (Turn 1 — tool calls only, no text output)
 1. Call resolve_settings.
 2. Call initialize_workspace with resolved state_dir.
 3. Call get_session_status — if active, present status and offer resume/archive.
 4. Call assess_task_complexity.
 5. Parse MAESTRO_DISABLED_AGENTS from resolved settings. Exclude listed agents from all planning.
 6. STOP. Turn 1 is ONLY steps 1-5. No text, no design questions, no file reads.

CLASSIFICATION (Turn 2)
 7. Load templates and references: ["architecture", "design-document", "implementation-plan", "session-state"].
 8. Classify task as simple/medium/complex. Present classification with rationale.
 9. Route: simple → Express (step 31). Medium/complex → continue to step 10.

DESIGN (Phase 1)
10. Enter Plan Mode. If unavailable, follow the runtime preamble's Plan Mode fallback instructions.
11. Load the design-dialogue skill. Follow its protocol for:
    - Design depth selector (first design question)
    - Repository grounding (for existing codebases, skip for greenfield)
    - One question at a time via user prompt
    - Enrichment per chosen depth (Quick/Standard/Deep)
    <HARD-GATE>
    Technology Recommendation Gate: Before presenting technology options, re-read
    the <user-request>. If the request implies static delivery (fan site, portfolio,
    landing page, profile page) or specifies vanilla/static/no-frameworks, the
    recommended option MUST be vanilla HTML/CSS/JS. Do NOT recommend frameworks
    (Next.js, React, Vue, Svelte, Astro) unless the request explicitly requires
    server-side rendering, authentication, database queries, or real-time updates.
    </HARD-GATE>
    <ANTI-PATTERN>
    WRONG: user requests "fan site" → options include React, Next.js, Astro
    CORRECT: user requests "fan site" → recommended option is vanilla HTML/CSS/JS
    </ANTI-PATTERN>
12. Present design sections one at a time, per the design-dialogue skill's convergence protocol.
    <HARD-GATE>
    Each section must be presented individually and approved via user prompt before
    proceeding to the next. Do NOT present the full design as a single block.
    Quick depth may combine sections. Standard/Deep MUST validate individually.
    </HARD-GATE>
13. Write approved design document to <state_dir>/plans/ (or Plan Mode tmp path).
14. If Plan Mode is active, exit Plan Mode with the plan path. Copy approved document to <state_dir>/plans/.

PLANNING (Phase 2)
15. Load the implementation-planning skill. Follow its protocol.
16. Call validate_plan with the generated plan and task_complexity. Fix any error-severity violations.
    <HARD-GATE>
    Agent-deliverable compatibility: read-only agents (architect, api_designer,
    code_reviewer, content_strategist, compliance_reviewer) CANNOT be assigned
    to phases that create or modify files. validate_plan enforces this server-side.
    If it returns agent_capability_mismatch errors, reassign to a write-capable agent.
    </HARD-GATE>
17. Present plan for user approval (Approve / Revise / Abort via user prompt).
18. Write approved implementation plan to <state_dir>/plans/.

EXECUTION SETUP (Phase 3 — pre-delegation)
19. Load the execution skill. Follow its Execution Mode Gate.
    <HARD-GATE>
    Present ONLY "Parallel" and "Sequential" as execution mode options.
    Do NOT present "Ask" as a user-facing choice — "ask" is a setting value
    that means "prompt the user", not an execution mode the user selects.
    </HARD-GATE>
20. Load the session-management skill.
21. Create session via create_session with resolved execution_mode. Do NOT create before mode is resolved.
22. Load delegation, validation, agent-base-protocol, and filesystem-safety-protocol.

EXECUTION (Phase 3 — delegation loop)
23. For each phase (or parallel batch): delegate to the assigned agent.
    <HARD-GATE>
    Dispatch by calling the agent's registered tool directly.
    Do NOT use the built-in generalist tool or invoke agents by bare name.
    Each Maestro agent carries specialized methodology, tool restrictions, temperature,
    and turn limits from its frontmatter that the generalist ignores.
    </HARD-GATE>
24. After each agent returns, parse Task Report + Downstream Context from response.
25. Call transition_phase to persist results. For parallel batches, call transition_phase for EVERY completed phase.
26. Repeat steps 23-25 until all phases complete.

COMPLETION (Phase 4)
27. Load the code-review skill.
28. If execution changed non-documentation files, delegate to code_reviewer. Block on Critical/Major findings.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to the implementing agent to fix.
    The orchestrator MUST NOT write code directly.
    </HARD-GATE>
29. If MAESTRO_AUTO_ARCHIVE is true (or unset), call archive_session. If false, inform user session is complete but not archived.
30. Present final summary with files changed, phase outcomes, and next steps.

RECOVERY (referenced from any step on user request)
If the user says the flow moved too fast: return to the most recent unanswered approval gate.
If the user asks for implementation before approval: remind them Maestro requires approval first.
If the user asks to skip execution-mode: remind them parallel/sequential is required unless MAESTRO_EXECUTION_MODE pins it.
If an answer invalidates a prior choice: restate the updated assumption and re-run the relevant gate.
If delegation collapses to parent session without fallback approval: return to step 19 or re-scope the child-agent work packages.
```

## 5. Step Sequence — Express Workflow

```
EXPRESS WORKFLOW (simple tasks only — jumped to from step 9)

EXPRESS MODE GATE BYPASS: Express bypasses the execution-mode gate entirely. Express always dispatches sequentially. Do NOT prompt for parallel/sequential.

EXPRESS MCP FALLBACK: If MCP state tools (create_session, transition_phase, archive_session) are unavailable, fall back to direct file writes on <state_dir>/state/active-session.md.

31. Verify classification is simple. If task requires multiple phases or agents, override to medium → step 10.
    <HARD-GATE>
    Express sessions MUST have exactly one implementation phase with exactly one agent.
    </HARD-GATE>
32. Ask 1-2 clarifying questions from Area 1 only via user prompt.
33. Present structured Express brief as plain text.
    <HARD-GATE>
    Brief MUST be plain text output, NOT inside a user prompt parameter.
    Approval is a SEPARATE prompt with only: "Approve this Express brief to proceed?"
    </HARD-GATE>
34. On approval, create session with workflow_mode: "express", exactly 1 phase.
    On rejection, revise. On second rejection, escalate to Standard → step 10.
35. Load agent-base-protocol and filesystem-safety-protocol. Prepend to delegation prompt.
36. Delegate to the assigned agent.
    <HARD-GATE>
    Same dispatch rule as step 23: call agent by registered tool name, not generalist.
    </HARD-GATE>
37. Parse Task Report. Call transition_phase to persist files_created/modified/deleted and downstream_context.
38. Delegate to code_reviewer.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to implementing agent (1 retry).
    Orchestrator MUST NOT write code directly. If retry fails, escalate to user.
    </HARD-GATE>
39. Call archive_session.
40. Present summary.

EXPRESS RESUME (when resuming an Express session from get_session_status)
If phase is pending: re-generate and present brief (step 33). On approval, proceed to delegation (step 36).
If phase is in_progress: re-delegate with same scope (step 36).
If phase is completed but session is in_progress: run code review (step 38), then archive (step 39).
```

## 6. What Gets Removed

### From Gemini `orchestrate.toml` (~347 lines → ~30 lines):

Everything between the command header and the end of the prompt is replaced by: "Load orchestration-steps and follow them." The entire inlined protocol goes away.

| Removed | Why |
|---------|-----|
| `# Design Dialogue Protocol` and ALL sub-sections (`## Plan Mode`, `## Repository Grounding`, `## Design Depth Gate`, `## Technology Recommendation Gate`, `## Question Framework`, `## Enrichment Protocol`, `## Approach Presentation`, `## Design Convergence`, `## Design Document Output`) (~120 lines) | Loaded on demand via `get_skill_content(["design-dialogue"])`. Tech Recommendation Gate moves to step 11 in shared steps. |
| `# Maestro Orchestrate` + orphaned template read | Template read becomes step 7. Header redundant. |
| `## Workflow Routing` | Replaced by step 9 |
| `## Hard Gates (Standard Workflow Only)` | Each gate is now inline on its step |
| `## First-Turn Contract (Standard Workflow Only)` | Replaced by steps 1-6 (STARTUP phase) |
| `## Workflow` (9-item prose list) | Replaced by step sequence |
| `## Design Phase Behavior` | Replaced by steps 10-14 |
| `## Required Question Order` | Lives in design-dialogue skill |
| `## Selection Rules` | Lives in design-dialogue skill |
| `## Design Approval Gate` | Replaced by step 12 |
| `## Planning Phase Behavior` | Replaced by steps 15-18 |
| `## Plan Approval Gate` | Replaced by step 17 |
| `## Execution Mode Gate` (prose) | Replaced by step 19 |
| `## Delegation Requirement` (prose) | Replaced by step 23 |
| `## Execution Start Condition` | Implicit — steps 19-22 before 23 |
| `## Recovery Rules` | Compact RECOVERY block after step 30 |

### From Claude `orchestrate.md` (~773 lines → ~80 lines):

The Claude command is significantly larger than the Gemini one due to a legacy instruction block (~200 lines at lines 562-773) that duplicates GEMINI.md content. This entire block is replaced by the shared steps.

| Removed | Why |
|---------|-----|
| `### Phase 1: Design` through `### Phase 4: Complete` | Replaced by shared step sequence |
| Inline agent capability HARD-GATE (Phase 2) | Moves to step 16 in shared steps |
| `## Execution Mode Protocol` | Replaced by step 19 |
| `## Delegation` / `## Parallel Execution` / `## Parallel Execution Contract` / `## Delegation Rules` | Replaced by steps 22-26 + delegation skill |
| `## Content Writing Rule` | Moves to runtime preamble |
| `## State Paths` / `## Session State Access` | Moves to runtime preamble |
| `## Skills Reference` | Replaced by skill loading in steps |
| `## Agent Naming Convention` | Covered by runtime preamble agent prefix mapping |
| `## Agent Roster` | Stays as reference table |
| `## Reference Files` | Moves to runtime preamble |
| Legacy `# Maestro Orchestrate` block (lines 562-773) | Entirely replaced by shared steps |

### What stays in both commands (runtime-specific):
- Runtime preamble (tool/agent/MCP name mappings, Plan Mode fallback instructions, skill loading paths)
- Reference tables (agent roster, settings, domain analysis)
- `## Skill Entry Points` table (Claude only — lists bundled slash command skills)
- `## Skill Loading` path table (Claude only — maps skill names to `${CLAUDE_PLUGIN_ROOT}` paths)

## 7. Risk Assessment

**Risk: Model doesn't load the shared steps file**
- Severity: Medium
- The command's only procedural instruction is "load this file and follow it." The model can't proceed without loading it. This is a loud failure (zero progress), not a silent one.

**Risk: Step list is too long (40 steps total: 30 Standard + 10 Express)**
- Severity: Medium
- Steps are grouped under phase headers (8 groups of 3-5 steps each). The model processes numbered lists as sequences with clear boundaries — higher fidelity than prose. HARD-GATEs reinforce decision points.

**Risk: Runtime preamble gets ignored**
- Severity: Low
- Preamble is the first content in the command. Tool syntax errors produce immediate runtime errors that force correction.

**Risk: Shared steps file diverges from runtime capabilities**
- Severity: Low
- Steps use generic language ("Load the delegation skill", "Delegate to the assigned agent"). Runtime-specific syntax is only in the preamble.

**Risk: HARD-GATEs lose effectiveness through overuse**
- Severity: Low-Medium
- ~10 HARD-GATEs total across 40 steps. Each appears at a distinct decision point. Current commands have 5-7 HARD-GATEs — the increase is marginal.

## 8. Success Criteria

1. **Zero prose instruction sections in either orchestrate command.** Both commands consist of: runtime preamble, shared step reference load, and reference tables.

2. **Every behavioral rule is either a numbered step or a HARD-GATE on a step.** Grep both commands for plain-text instructions not in a step or HARD-GATE — count should be zero.

3. **Startup template/reference read happens before classification.** Step 7 loads templates. Step 8 classifies. Verified by transcript inspection.

4. **Technology Recommendation Gate enforced.** HARD-GATE on step 11 prevents framework recommendations for static-scope requests. Verified by Bristlebomb test.

5. **Design sections validated individually.** HARD-GATE on step 12 enforces per-section approval. Verified by transcript showing multiple user prompts during design.

6. **Agent dispatch uses registered tool names.** HARD-GATE on steps 23/36 prevents generalist usage. Verified by transcript tool call names.

7. **Shared step sequence is single-source.** `references/orchestration-steps.md` loaded by both runtimes. Diff confirms same file.

8. **Cross-runtime regression.** Bristlebomb test on both runtimes produces same workflow behavior.

9. **Express sub-protocols preserved.** EXPRESS RESUME, EXPRESS MCP FALLBACK, and EXPRESS MODE GATE BYPASS are present as labeled blocks in the Express step sequence. Verified by reading the shared steps file.

10. **Disabled agents respected.** Step 5 parses `MAESTRO_DISABLED_AGENTS`. Verified by checking that disabled agents are excluded from plan assignments.
