# Gemini Orchestration Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable Gemini Standard workflow by flattening the orchestrate.toml step list, inlining the design-dialogue skill content into the TOML prompt (so it's loaded at command activation — no model action required), and using explicit `read_file` for execution-phase skills that fire later.

**Architecture:** Two mechanisms based on when skills fire: (1) Design-dialogue skill content is inlined directly into the orchestrate.toml prompt — like superpowers, the skill content IS the command content. The model has it from turn 1 with no activation step needed. (2) Execution-phase skills (execution, delegation, session-management, validation, code-review) fire later during Phase 3-4 and use `read_file` instructions. This keeps the TOML focused on the design phase (the biggest gap) without making it 2000+ lines. The Technology Recommendation Gate is part of the inlined design-dialogue content.

**Tech Stack:** Prompt engineering (Markdown, TOML). No code changes.

**Approach rationale:** Superpowers works because skill content is already loaded when the model starts. Maestro's Standard workflow fails because the model must autonomously load skills — which it doesn't. Inlining the design-dialogue solves the biggest cluster of gaps (10 of 34 unreliable protocol items) without inlining ALL 1900 lines of skill content.

---

## File Map

### Files Modified

- `commands/maestro/orchestrate.toml` — Replace lines 11-51 (sectioned step list) with flat 16-step list + inlined design-dialogue protocol (~170 lines of design methodology added)
- `GEMINI.md` — Replace "Activate X" directives for execution-phase skills (Phases 2-4) with `read_file` instructions. Phase 1 "Activate design-dialogue" replaced with "Follow the design-dialogue protocol inlined in the orchestrate command."

### Files NOT Modified

- `claude/` — Claude is working, don't touch
- `GEMINI.md` Express Flow — Working on both runtimes, don't touch
- `skills/design-dialogue/SKILL.md` — Remains as the canonical source; the TOML inlines a condensed version
- `skills/implementation-planning/SKILL.md` — Loaded via read_file in Phase 2
- `skills/execution/SKILL.md` — Loaded via read_file in Phase 3
- `skills/delegation/SKILL.md` — Loaded via read_file in Phase 3
- `skills/session-management/SKILL.md` — Loaded via read_file in Phase 2
- `skills/code-review/SKILL.md` — Loaded via read_file in Phase 4
- `skills/validation/SKILL.md` — Loaded via read_file in Phase 3

---

## Tasks

### Task 1: Flatten orchestrate.toml Step List + Inline Design-Dialogue

**Files:**
- Modify: `commands/maestro/orchestrate.toml:11-51`

- [ ] **Step 1: Replace the step list and add inlined design-dialogue protocol**

Replace everything from `Follow the Maestro orchestration protocol:` through the closing `---` separator (lines 11-52) with this content:

```
Follow the Maestro orchestration protocol:

1. Call `resolve_settings` to resolve all MAESTRO_* environment variables
2. Call `initialize_workspace` with the resolved state_dir (default: docs/maestro)
3. Call `get_session_status` to check for an active session. If it returns session data (exists: true), present its status and offer to resume or archive. If no session exists (exists: false), proceed to step 4.
4. Call `assess_task_complexity` with the task description to get repo signals
5. Your first turn must be ONLY these 4 tool calls (steps 1-4). Do not output user-facing text, present the design depth selector, read files, or list directories until all 4 return.
6. Classify the task as simple/medium/complex using the MCP response + heuristics from the orchestrator template. Present classification to user.
7. Route based on classification: simple tasks follow Express Workflow from the orchestrator template. Medium/complex tasks continue with the Standard Workflow below.
8. Follow the Design Dialogue Protocol below for Phase 1 (design phase). The protocol is inlined in this command — no skill activation or file reading needed.
9. Once design is approved, write the design document to `<state_dir>/plans/`
10. Read `${extensionPath}/skills/implementation-planning/SKILL.md` using `read_file` and follow its protocol for Phase 2 (planning). Before presenting the plan, verify each phase's agent can deliver its requirements — read-only agents (architect, api_designer, code_reviewer, content_strategist, compliance_reviewer) cannot be assigned to phases that create files. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/implementation-planning/SKILL.md` as fallback.
11. Present plan for user approval
12. Read `${extensionPath}/skills/execution/SKILL.md` using `read_file` and resolve the execution mode gate (parallel vs sequential) before creating the session. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/execution/SKILL.md` as fallback.
13. Create the session state file with the resolved execution_mode
14. Read `${extensionPath}/skills/delegation/SKILL.md` using `read_file`. Execute phases according to the resolved mode, delegating to subagents. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/delegation/SKILL.md` as fallback.
15. Update session state after each phase completion. For parallel batches, call transition_phase for EVERY completed phase in the batch, not just the first one.
16. Before completion/archival, run a final `code_reviewer` quality gate if execution changed non-documentation files; block completion on unresolved Critical/Major findings

# Design Dialogue Protocol (Phase 1 — Standard Workflow Only)

This protocol is loaded with the orchestrate command. Follow it for Phase 1. Do not call `activate_skill` for design-dialogue — the protocol is already here.

## Plan Mode

Call `enter_plan_mode` to enter Plan Mode at the start of Phase 1. If the tool call fails or is unavailable, inform the user: "Plan Mode gives you a dedicated review surface for designs and plans. To enable it, run `gemini --settings` and set `experimental.plan` to `true`, then restart." Ask if they want to pause and enable it, or continue without Plan Mode. If continuing without Plan Mode, use `ask_user` for design approvals instead.

## Repository Grounding

Before narrowing the architecture for work that touches an existing codebase, use the built-in `codebase_investigator` to gather: the current architecture slice, impacted modules/files, existing naming and testing conventions, integration points, validation commands, and parallelization/conflict risks. Skip for greenfield tasks, documentation-only work, or scopes already grounded from direct file reads.

## Design Depth Gate

Before asking any design questions, present a depth selector using `ask_user` with `type: 'choice'`:

- **Standard** (Recommended) — Assumption surfacing after each answer, decision matrix during approach evaluation, rationale annotations in design sections. The default for most work.
- **Quick** — No enrichment. One question per topic, standard design sections. Fast when you already have clarity.
- **Deep** — Full treatment: follow-up probing, assumption surfacing with confirmation, trade-off narration, decision matrix with scoring, rationale annotations, per-decision alternatives, and requirement traceability. For high-stakes or ambiguous tasks.

Remember the chosen depth and apply it to all subsequent steps. For `simple` complexity, auto-select Quick. For `medium`, recommend Standard. For `complex`, recommend Standard or Deep.

Record `design_depth` and `task_complexity` in the design document frontmatter.

## Technology Recommendation Gate

Before presenting technology or framework options in any design question, re-read the <user-request> and check:
- Did the user specify or imply a tech stack? (e.g., "vanilla", "static", "no frameworks", "HTML/CSS/JS")
- Did the user describe a scope that implies static delivery? (e.g., "fan site", "profile page", "portfolio", "landing page")

If yes, the recommended option MUST align with the user's stated or implied preference. Do NOT recommend frameworks (Next.js, React, Vue, Svelte, etc.) unless the user's request explicitly requires capabilities that vanilla HTML/CSS/JS cannot deliver (e.g., server-side rendering, authentication, database queries, real-time updates). A multi-page static site with animations, charts (via CDN), and interactive features does NOT require a framework.

## Question Framework

Ask one question at a time. Prefer multiple choice with 2-4 options. Lead with recommended option. Wait for response before proceeding.

Required Coverage Areas (ask in this order):

1. **Problem Scope & Boundaries** — What problem, what's out of scope, expected inputs/outputs
2. **Technical Constraints & Limitations** — Existing stack, compatibility, performance budgets
3. **Technology Preferences** — Language/framework, database, third-party dependencies
4. **Quality Requirements** — Performance targets, security, scalability, reliability
5. **Deployment Context** — Target environment, CI/CD, monitoring, operational constraints

Scale coverage by complexity: simple = Area 1 only. Medium = Areas 1-3. Complex = all 5 areas.

## Enrichment Protocol

After each user answer, apply depth-gated enrichment:

| Step | Quick | Standard | Deep |
|------|-------|----------|------|
| Accept answer and move on | Yes | Yes | Yes |
| Surface assumptions from the answer | No | Yes | Yes |
| Ask user to confirm/correct assumptions | No | Yes | Yes |
| Probe implications with a follow-up question (max 1) | No | No | Yes |
| Narrate trade-offs of the choice | No | No | Yes |

Quick: no enrichment, proceed to next question. Standard: state assumptions in 1-2 sentences, ask user to confirm. Deep: assumptions + trade-off narration + one probing follow-up if the answer has non-obvious implications.

Skip enrichment if the answer is concrete and requires no inference (e.g., "TypeScript, same as the rest of the repo").

## Approach Presentation

Present 2-3 approaches after covering scope, constraints, and technology preferences. For each:
- Summary (2-3 sentences)
- Architecture (component overview)
- Pros and Cons (concrete, with context)
- Best When (specific conditions)
- Risk Level (Low/Medium/High)

Lead with recommended approach. In Standard/Deep modes, include a decision matrix scoring approaches against 3-6 criteria derived from requirements (1-5 scale, weighted). In Quick mode, skip the matrix.

## Design Convergence

Present the design section by section, validating each before proceeding.

Minimum sections (always): Problem Statement, Approach, Risk Assessment.
Full order (medium/complex): Problem Statement, Requirements, Approach, Architecture, Agent Team, Risk Assessment, Success Criteria.

Simple tasks: 3 minimum sections, 100-150 words each.
Medium: 4-5 sections, 150-250 words each.
Complex: all 7 sections, 200-300 words each.

After each section, use `ask_user` with `type: 'yesno'` for approval. Include the section content in the question body.

Section reasoning by depth:
- Quick: no annotations
- Standard: rationale annotations tying decisions to project context
- Deep: rationale annotations + per-decision alternatives + requirement traceability (`Traces To: REQ-N`)

## Design Document Output

Write to `<state_dir>/plans/YYYY-MM-DD-<topic-slug>-design.md`. If Plan Mode is active, write to `~/.gemini/tmp/<project>/plans/` first.
```

Also remove the `## Technology Recommendation Gate` section that was previously below the step list (it's now inlined in the Design Dialogue Protocol above).

- [ ] **Step 2: Remove the standalone Technology Recommendation Gate section**

Find and delete the `## Technology Recommendation Gate` section (including its HARD-GATE block) that was previously between `## Required Question Order` and `## Selection Rules` in orchestrate.toml. The gate is now part of the inlined design-dialogue protocol.

- [ ] **Step 3: Verify structure**

```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('commands/maestro/orchestrate.toml', 'utf8');
console.log('Has flat step list:', c.includes('1. Call \`resolve_settings\`'));
console.log('No STARTUP section:', !c.includes('STARTUP ('));
console.log('No HARD-GATE in step list:', !c.includes('<HARD-GATE>') || c.indexOf('<HARD-GATE>') > c.indexOf('# Maestro Orchestrate'));
console.log('Has Design Dialogue Protocol:', c.includes('# Design Dialogue Protocol'));
console.log('Has Enrichment Protocol:', c.includes('## Enrichment Protocol'));
console.log('Has Tech Recommendation Gate:', c.includes('## Technology Recommendation Gate'));
console.log('Standalone Tech Gate removed:', !c.includes('## Technology Recommendation Gate\n\n<HARD-GATE>'));
console.log('Required Question Order survived:', c.includes('## Required Question Order'));
console.log('Selection Rules survived:', c.includes('## Selection Rules'));
"
```

Expected: all `true`.

- [ ] **Step 4: Commit**

```bash
git add commands/maestro/orchestrate.toml
git commit -m "refactor(gemini): flatten step list + inline design-dialogue protocol

Replace STARTUP/STANDARD WORKFLOW sections with flat 16-step list.
Inline the design-dialogue skill's critical protocol content directly
into the orchestrate command — design depth gate, enrichment protocol,
question framework, approach presentation, decision matrix, design
convergence, and section reasoning guide.

This mirrors the superpowers pattern: skill content IS the command
content. The model has it from turn 1 with no activation step needed.

Execution-phase skills (implementation-planning, execution, delegation)
use explicit read_file instructions — they fire later when the model
is in a different workflow state.

Technology Recommendation Gate moved from standalone HARD-GATE section
into the inlined design-dialogue protocol as strong prose."
```

---

### Task 2: Replace "Activate" Directives in GEMINI.md

**Files:**
- Modify: `GEMINI.md`

- [ ] **Step 1: Replace Phase 1 directive**

Find `- Activate \`design-dialogue\`.` in Standard Workflow Phase 1. Replace with:

```
- Follow the Design Dialogue Protocol inlined in the orchestrate command. Do not call `activate_skill` for design-dialogue — the protocol is already loaded.
```

- [ ] **Step 2: Replace Phase 2 directives**

Replace `- Activate \`implementation-planning\`.` with:

```
- Read `${extensionPath}/skills/implementation-planning/SKILL.md` using `read_file` and follow its protocol. If `read_file` fails, use `run_shell_command` with `cat` on the same path.
```

Replace `- Activate \`session-management\` to create session state.` with:

```
- Read `${extensionPath}/skills/session-management/SKILL.md` using `read_file` and follow its session creation protocol. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/session-management/SKILL.md` as fallback.
```

- [ ] **Step 3: Replace Phase 3 directives**

Replace `- Activate \`execution\` and \`delegation\`.` with:

```
- Read `${extensionPath}/skills/execution/SKILL.md` and `${extensionPath}/skills/delegation/SKILL.md` using `read_file` and follow their protocols. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat` on the same paths as fallback.
```

Replace `- Activate \`validation\` for quality gates.` with:

```
- Read `${extensionPath}/skills/validation/SKILL.md` using `read_file` and follow its validation protocol. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/validation/SKILL.md` as fallback.
```

- [ ] **Step 4: Replace Phase 4 directive**

Replace the `activate \`code-review\`` reference with:

```
- If execution changed non-documentation files, read `${extensionPath}/skills/code-review/SKILL.md` using `read_file` and run a final `code_reviewer` pass. If `read_file` fails due to workspace sandboxing, use `run_shell_command` with `cat ${extensionPath}/skills/code-review/SKILL.md` as fallback.
```

- [ ] **Step 5: Fix orphaned "Activate skills" in Workflow Mode Selection**

Find `Activate skills as directed by each phase` in the Workflow Mode Selection HARD-GATE (around line 104). Replace with:

```
Read skill files as directed by each phase.
```

- [ ] **Step 6: Verify no "Activate" directives remain in Standard Workflow**

```bash
grep -n "Activate" GEMINI.md | grep -v "Express\|simple\|Do not activate\|Do not call"
```

Expected: empty output. This catches both backtick-wrapped `Activate \`skill\`` and plain-prose "Activate skills as directed".

- [ ] **Step 7: Commit**

```bash
git add GEMINI.md
git commit -m "refactor(gemini): replace 'Activate skill' with read_file for execution-phase skills

Phase 1 (design): now references the inlined protocol in orchestrate.toml.
Phases 2-4: use explicit read_file on skill files with cat fallback.

Express Workflow unchanged (no skills activated in Express)."
```

---

### Task 3: Verify and Push

- [ ] **Step 1: Verify HARD-GATE count**

```bash
echo "orchestrate.toml:" && grep -c "HARD-GATE" commands/maestro/orchestrate.toml
echo "GEMINI.md:" && grep -c "HARD-GATE" GEMINI.md
```

Expected: orchestrate.toml ~2 (Workflow Routing only, no step list HARD-GATEs). GEMINI.md ~8 (Express Flow, unchanged).

- [ ] **Step 2: Verify Express untouched**

```bash
grep -A2 "Express mode is for" GEMINI.md
```

Expected: "Do not activate any skills" (unchanged).

- [ ] **Step 3: Verify Claude untouched**

```bash
git diff --name-only | grep "claude/"
```

Expected: no output.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Summary

| Task | Description | Files Modified | Commits |
|------|-------------|----------------|---------|
| 1 | Flatten step list + inline design-dialogue | 1 | 1 |
| 2 | Replace Activate directives in GEMINI.md | 1 | 1 |
| 3 | Verify and push | 0 | 0 |
| **Total** | | **2** | **2** |

## Rollback

```bash
git revert HEAD~2..HEAD
```
