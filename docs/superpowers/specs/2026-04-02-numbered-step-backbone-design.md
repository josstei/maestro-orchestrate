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
- Technology Recommendation Gate wrapped in HARD-GATE + anti-pattern
- Shared step sequence lives in a single reference file loaded by both runtimes
- No new MCP tools or skills — instruction structure only

## 3. Approach

### Numbered-Step Backbone

Restructure the entire command around a single numbered step list as the sole procedural authority. Remove ALL prose instruction sections. Every action — including behavioral constraints — becomes a step or a HARD-GATE constraint on a step. Nothing exists outside the numbered list except definition tables.

Steps are grouped under phase headers (STARTUP, CLASSIFICATION, DESIGN, PLANNING, EXECUTION SETUP, EXECUTION, COMPLETION, EXPRESS) that break the list into chunks of 3-5 steps each.

### Cross-Runtime Parity via Shared Reference File

The step sequence lives in `references/orchestration-steps.md`. Both runtimes load it:
- Gemini: `get_skill_content(["orchestration-steps"])` — requires adding `orchestration-steps` to the `RESOURCE_ALLOWLIST` in both `lib/mcp/handlers/get-skill-content.js` and the bundled section in `mcp/maestro-server.js`
- Claude: `Read ${CLAUDE_PLUGIN_ROOT}/references/orchestration-steps.md`

Each runtime's command file becomes a thin shell: runtime preamble + "load and follow orchestration-steps" + runtime-specific reference tables.

### Runtime Preamble

Each command starts with a preamble that maps generic step language to runtime-specific tool syntax:

**Gemini CLI preamble:**
- Skill loading: `get_skill_content(resources: [...])`
- Agent dispatch: Call agent tool by name — `coder(query: "...")`, `tester(query: "...")`
- MCP tools: `mcp_maestro_<tool_name>`
- Plan Mode: `enter_plan_mode` / `exit_plan_mode`
- User prompts: `ask_user` with `type: 'choice'` or `type: 'yesno'`

**Claude Code preamble:**
- Skill loading: `Read ${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`
- Agent dispatch: `Agent(subagent_type: "maestro:<name>", prompt: "...")`
- MCP tools: `mcp__plugin_maestro_maestro__<tool_name>`
- Plan Mode: `EnterPlanMode` / `ExitPlanMode`
- User prompts: `AskUserQuestion`
- Agent name prefix: All names require `maestro:` prefix

Steps use generic references ("Load the delegation skill", "Delegate to the assigned agent") that the preamble resolves.

## 4. Step Sequence — Standard Workflow

```
STARTUP (Turn 1 — tool calls only, no text output)
 1. Call resolve_settings
 2. Call initialize_workspace with resolved state_dir
 3. Call get_session_status — if active, present status and offer resume/archive
 4. Call assess_task_complexity
 5. STOP. Turn 1 is ONLY steps 1-4. No text, no design questions, no file reads.

CLASSIFICATION (Turn 2)
 6. Load templates and references: ["architecture", "design-document", "implementation-plan", "session-state"]
 7. Classify task as simple/medium/complex. Present classification with rationale.
 8. Route: simple → Express (step 30). Medium/complex → continue to step 9.

DESIGN (Phase 1)
 9. Enter Plan Mode. If unavailable, inform user and offer to continue without it.
10. Load the design-dialogue skill. Follow its protocol for:
    - Design depth selector (first design question)
    - Repository grounding (for existing codebases, skip for greenfield)
    - One question at a time, user prompt type: 'choice'
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
11. Present design sections one at a time, per the design-dialogue skill's convergence protocol.
    <HARD-GATE>
    Each section must be presented individually and approved via user prompt before
    proceeding to the next. Do NOT present the full design as a single block.
    Quick depth may combine sections. Standard/Deep MUST validate individually.
    </HARD-GATE>
12. Write approved design document to <state_dir>/plans/ (or Plan Mode tmp path).

PLANNING (Phase 2)
13. Load the implementation-planning skill. Follow its protocol.
14. Call validate_plan with the generated plan and task_complexity. Fix any error-severity violations.
    <HARD-GATE>
    Agent-deliverable compatibility: read-only agents (architect, api_designer,
    code_reviewer, content_strategist, compliance_reviewer) CANNOT be assigned
    to phases that create or modify files. validate_plan enforces this server-side.
    If it returns agent_capability_mismatch errors, reassign to a write-capable agent.
    </HARD-GATE>
15. Present plan for user approval (Approve / Revise / Abort via user prompt type: 'choice').
16. Write approved implementation plan to <state_dir>/plans/.

EXECUTION SETUP (Phase 3 — pre-delegation)
17. Load the execution skill. Follow its Execution Mode Gate.
    <HARD-GATE>
    Present ONLY "Parallel" and "Sequential" as execution mode options.
    Do NOT present "Ask" as a user-facing choice — "ask" is a setting value
    that means "prompt the user", not an execution mode the user selects.
    </HARD-GATE>
18. Load the session-management skill.
19. Create session via create_session with resolved execution_mode. Do NOT create before mode is resolved.
20. Load delegation, validation, agent-base-protocol, and filesystem-safety-protocol.

EXECUTION (Phase 3 — delegation loop)
21. For each phase (or parallel batch): delegate to the assigned agent.
    <HARD-GATE>
    Dispatch by calling the agent's registered tool directly.
    Do NOT use the built-in generalist tool (Gemini) or bare agent names (Claude).
    Each Maestro agent carries specialized methodology, tool restrictions, temperature,
    and turn limits from its frontmatter that the generalist ignores.
    </HARD-GATE>
22. After each agent returns, parse Task Report + Downstream Context from response.
23. Call transition_phase to persist results. For parallel batches, call transition_phase for EVERY completed phase.
24. Repeat steps 21-23 until all phases complete.

COMPLETION (Phase 4)
25. Load the code-review skill.
26. If execution changed non-documentation files, delegate to code_reviewer. Block on Critical/Major findings.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to the implementing agent to fix.
    The orchestrator MUST NOT write code directly.
    </HARD-GATE>
27. Call archive_session.
28. Present final summary with files changed, phase outcomes, and next steps.
```

## 5. Step Sequence — Express Workflow

```
EXPRESS WORKFLOW (simple tasks only — jumped to from step 8)
30. Verify classification is simple. If task requires multiple phases or agents, override to medium → step 9.
    <HARD-GATE>
    Express sessions MUST have exactly one implementation phase with exactly one agent.
    </HARD-GATE>
31. Ask 1-2 clarifying questions from Area 1 only. Use user prompt type: 'choice' where possible.
32. Present structured Express brief as plain text.
    <HARD-GATE>
    Brief MUST be plain text output, NOT inside a user prompt parameter.
    Approval is a SEPARATE prompt with only: "Approve this Express brief to proceed?"
    </HARD-GATE>
33. On approval, create session with workflow_mode: "express", exactly 1 phase.
    On rejection, revise. On second rejection, escalate to Standard → step 9.
34. Load agent-base-protocol and filesystem-safety-protocol. Prepend to delegation prompt.
35. Delegate to the assigned agent.
    <HARD-GATE>
    Same dispatch rule as step 21: call agent by registered tool name, not generalist.
    </HARD-GATE>
36. Parse Task Report. Call transition_phase to persist results.
37. Delegate to code_reviewer.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to implementing agent (1 retry).
    Orchestrator MUST NOT write code directly. If retry fails, escalate to user.
    </HARD-GATE>
38. Call archive_session.
39. Present summary.
```

## 6. What Gets Removed

### From Gemini `orchestrate.toml` (~347 lines → ~30 lines):

| Removed | Why |
|---------|-----|
| Inlined Design Dialogue Protocol (~120 lines) | Loaded on demand via `get_skill_content(["design-dialogue"])` |
| `## Workflow Routing` | Replaced by step 8 |
| `## Hard Gates` | Each gate is now inline on its step |
| `## First-Turn Contract` | Replaced by step 5 |
| `## Workflow` (9-item prose list) | Replaced by step sequence |
| `## Design Phase Behavior` | Replaced by steps 9-12 |
| `## Required Question Order` | Lives in design-dialogue skill |
| `## Selection Rules` | Lives in design-dialogue skill |
| `## Design Approval Gate` | Replaced by step 11 |
| `## Planning Phase Behavior` | Replaced by steps 13-16 |
| `## Plan Approval Gate` | Replaced by step 15 |
| `## Execution Mode Gate` (prose) | Replaced by step 17 |
| `## Delegation Requirement` (prose) | Replaced by step 21 |
| `## Execution Start Condition` | Implicit — steps 17-20 before 21 |
| `## Recovery Rules` | Compact note after step 28 |

### From Claude `orchestrate.md` (~400 lines → ~60 lines):

| Removed | Why |
|---------|-----|
| `### Phase 1-4` prose sections | Replaced by shared step sequence |
| Inline agent capability HARD-GATE | Moves to step 14 in shared steps |
| Domain Analysis prose | Stays as reference table |

### What stays in both commands (runtime-specific):
- Runtime preamble (tool/agent name mappings)
- Reference tables (agent roster, settings, skill loading paths)
- Recovery notes (compact, after step 28)

## 7. Risk Assessment

**Risk: Model doesn't load the shared steps file**
- Severity: Medium
- The command's only procedural instruction is "load this file and follow it." The model can't proceed without loading it. This is a loud failure (zero progress), not a silent one.

**Risk: Step list is too long (37 steps total)**
- Severity: Medium
- Steps are grouped under phase headers (7 groups of 3-5 steps each). The model processes numbered lists as sequences with clear boundaries — higher fidelity than prose. HARD-GATEs reinforce decision points.

**Risk: Runtime preamble gets ignored**
- Severity: Low
- Preamble is the first content in the command. Tool syntax errors produce immediate runtime errors that force correction.

**Risk: Shared steps file diverges from runtime capabilities**
- Severity: Low
- Steps use generic language ("Load the delegation skill", "Delegate to the assigned agent"). Runtime-specific syntax is only in the preamble.

**Risk: HARD-GATEs lose effectiveness through overuse**
- Severity: Low-Medium
- ~8 HARD-GATEs total across 37 steps. Each appears at a distinct decision point. Current commands have 5-7 HARD-GATEs — the increase is marginal.

## 8. Success Criteria

1. **Zero prose instruction sections in either orchestrate command.** Both commands consist of: runtime preamble, shared step reference load, and reference tables.

2. **Every behavioral rule is either a numbered step or a HARD-GATE on a step.** Grep both commands for plain-text instructions not in a step or HARD-GATE — count should be zero.

3. **Startup template/reference read happens before classification.** Step 6 loads templates. Step 7 classifies. Verified by transcript inspection.

4. **Technology Recommendation Gate enforced.** HARD-GATE on step 10 prevents framework recommendations for static-scope requests. Verified by Bristlebomb test.

5. **Design sections validated individually.** HARD-GATE on step 11 enforces per-section approval. Verified by transcript showing multiple user prompts during design.

6. **Agent dispatch uses registered tool names.** HARD-GATE on steps 21/35 prevents generalist usage. Verified by transcript tool call names.

7. **Shared step sequence is single-source.** `references/orchestration-steps.md` loaded by both runtimes. Diff confirms same file.

8. **Cross-runtime regression.** Bristlebomb test on both runtimes produces same workflow behavior.
