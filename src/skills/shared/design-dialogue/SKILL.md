---
name: design-dialogue
description: Guides structured design conversations for complex engineering tasks
---

# Design Dialogue Skill

**Standard workflow only.** If `task_complexity` is `simple` and workflow mode is Express, do not activate this skill. Simple tasks use the Express workflow, which does not activate design-dialogue. Return to the Express Workflow section.

Activate this skill when beginning Phase 1 of Maestro orchestration. Immediately call `enter_plan_mode` to enter Plan Mode for the design phase. If the tool call fails or is unavailable, inform the user that Plan Mode is not enabled and provide activation instructions: "Plan Mode gives you a dedicated review surface for designs and plans. To enable it, run: `gemini --settings` and set `experimental.plan` to `true`, then restart this session." Ask the user if they want to pause and enable it, or continue without Plan Mode. If continuing without Plan Mode, use `ask_user` with `type: 'yesno'` for design approvals and `type: 'choice'` for approach selection. This skill provides the structured methodology for conducting design conversations that converge on approved architectural designs.

**User confirmation sequence**: Phase 1 entry triggers two user-facing confirmations — first the `activate_skill` consent dialog (required for non-builtin skills), then the `enter_plan_mode` transition. Both are expected; do not treat the second confirmation as redundant or skip it.

## Design Depth Gate

Before asking any design questions, present the user with a depth selector to control the level of reasoning rigour applied throughout the design phase. Use `ask_user` with `type: 'choice'` to offer three modes. Lead with Standard as the recommended default.

**Modes:**

- **Quick** — Current reasoning behavior. One question per topic, pros/cons on approaches, standard design sections. No enrichment steps, no decision matrix, no reasoning annotations. Choose this when you already have clarity and want to move fast. (The depth selector prompt itself is the only new conversational step — once Quick is selected, all subsequent behavior matches pre-change behavior exactly.)
- **Standard** (Recommended) — Adds assumption surfacing after each answer and a decision matrix during approach evaluation. Design sections gain rationale annotations tying decisions to project context. The default for most work.
- **Deep** — Full treatment. Follow-up probing into implications, assumption surfacing with confirmation, trade-off narration on each choice, decision matrix with scoring, rationale annotations, per-decision alternatives, and full requirement traceability. Choose this for high-stakes or ambiguous tasks.

**Depth propagation**: Remember the user's chosen depth mode and apply it consistently to all subsequent steps in this skill. The depth mode is not re-prompted — it is set once and carried forward. If the user's answer to the depth prompt is ambiguous, default to Standard.

**Depth vs. complexity**: Depth and complexity guidance (simple/medium/complex) are orthogonal. Complexity controls which sections appear and word count per section. Depth controls reasoning richness within each section. They compose independently — a user may select Deep depth on a Simple complexity task or Quick depth on a Complex task. Both are valid choices.

**Frontmatter**: Record the chosen depth in the design document frontmatter as `design_depth: quick | standard | deep`. Also record `task_complexity: simple | medium | complex` in the design document frontmatter after `design_depth`.

**First-Turn Contract**: On the first turn, Maestro presents the complexity classification result (classified per the complexity classification section in the orchestrator) and the depth selector with a complexity-informed recommendation. For `simple` tasks, auto-select Quick and inform the user: "This looks straightforward — using Quick depth. Say 'deeper' if you want more analysis." For `medium` tasks, recommend Standard. For `complex` tasks, recommend Standard or Deep. The first actual design question moves to the second turn.

## Repository Grounding Protocol

Before you start narrowing the architecture for work that touches an existing codebase, decide whether the task is already grounded.

Use the built-in `codebase_investigator` when any of the following are true:
- The request targets an existing project or subsystem
- The current architecture, impacted modules, or integration seams are unclear
- You need concrete validation commands, conventions, or ownership boundaries before presenting approaches

Ask the investigator for:
- The current architecture slice relevant to the task
- The most likely impacted modules and files
- Existing naming, layering, and testing conventions to preserve
- Integration points and dependency edges the design must respect
- Validation commands already used by the repo
- Parallelization or file-conflict risks that should shape the later implementation plan

Skip `codebase_investigator` for greenfield tasks, documentation-only work, or scopes that are already well understood from direct file reads in the current turn.

Use the investigator's output to:
- Tailor follow-up questions to the actual codebase
- Avoid proposing approaches that conflict with existing boundaries
- Cite concrete modules/files when explaining trade-offs

## Question Framework

### Principles
- Ask one question at a time — never batch multiple questions
- Prefer multiple choice format with 2-4 options over open-ended questions
- For every choice presented, include brief pros and cons so the user can make an informed decision — never present bare options without trade-off context
- Lead with your recommended option and explain the rationale
- Wait for user response before proceeding to next question
- Adapt follow-up questions based on previous answers

### Required Coverage Areas

Ask questions in this order to progressively narrow the design space:

1. **Problem Scope & Boundaries**
   - What specific problem are we solving?
   - What is explicitly out of scope?
   - What are the expected inputs and outputs?

2. **Technical Constraints & Limitations**
   - Existing technology stack and infrastructure
   - Compatibility requirements with existing systems
   - Performance budgets (latency, throughput, resource limits)
   - Team expertise and familiarity

3. **Technology Preferences**
   - Language and framework preferences
   - Database and storage requirements
   - Third-party service dependencies
   - Build and deployment toolchain

4. **Quality Requirements**
   - Performance targets (response time, concurrent users)
   - Security requirements (authentication, authorization, data protection)
   - Scalability expectations (growth projections, peak loads)
   - Reliability requirements (uptime, disaster recovery)

5. **Deployment Context**
   - Target environment (cloud provider, on-premise, hybrid)
   - CI/CD pipeline requirements
   - Monitoring and observability needs
   - Operational constraints (team size, on-call, maintenance windows)

### Coverage Scaling by Complexity

Scale question coverage based on `task_complexity`:
- **simple**: Ask questions from Area 1 (Problem Scope & Boundaries) only. Skip Areas 2-5.
- **medium**: Ask questions from Areas 1-3 (Scope, Constraints, Tech Preferences). Skip Areas 4-5.
- **complex**: Ask questions from all 5 areas (current behavior).

### Question Format

Use `ask_user` with `type: 'choice'` for structured selections.

<!-- @feature geminiAskFormat -->
```json
{
  "questions": [
    {
      "header": "[Short Label]",
      "question": "[Topic Area]: [Clear, specific question]",
      "type": "choice",
      "options": [
        { "label": "[Option A]", "description": "(Recommended) [Why this is recommended, key benefits]" },
        { "label": "[Option B]", "description": "[When this makes sense, trade-offs]" },
        { "label": "[Option C]", "description": "[When this makes sense, trade-offs]" }
      ]
    }
  ]
}
```

- `header`: Short label displayed as a chip/tag. Must not exceed 16 characters (enforced by Gemini CLI validation). Examples: `Database`, `Auth`, `Runtime`.
- `options`: 2-4 items, each with `label` (1-5 words) and `description`

Include your recommendation rationale in the question text so the user has context before choosing.

<!-- @end-feature -->
### Enrichment Protocol

After the user answers each question, apply depth-gated enrichment steps before advancing to the next topic:

| Step | Quick | Standard | Deep |
|------|-------|----------|------|
| Accept answer and move on | Yes | Yes | Yes |
| Surface assumptions made from the answer | No | Yes | Yes |
| Ask user to confirm/correct assumptions | No | Yes | Yes |
| Probe implications with a follow-up question | No | No | Yes |
| Narrate trade-offs of the choice before moving on | No | No | Yes |

**Quick mode**: No enrichment steps. Accept the answer and proceed to the next question. Current behavior preserved.

**Standard mode**: After each user answer, state the assumptions you are making based on their response in 1-2 sentences, then ask the user to confirm or correct before proceeding. Example flow: question → answer → "Based on your answer, I'm assuming X and Y — correct?" → confirmation → next question.

**Deep mode**: After each user answer: (a) state and confirm assumptions as in Standard mode, (b) narrate the trade-offs of the choice in 1-2 sentences ("That choice means we gain A but give up B"), (c) if the answer has non-obvious implications (e.g., a technology choice that constrains future scaling options or creates a vendor lock-in dependency), ask one follow-up probing question before moving to the next topic. Cap at one follow-up per question.

**Adaptive elision**: If the user's answer is concrete, specific, and requires no inference (e.g., "What language?" → "TypeScript, same as the rest of the repo"), the assumption surfacing and trade-off narration steps may be skipped even in Deep mode. Only apply enrichment when there are genuine assumptions to surface or trade-offs to narrate. Do not elide when the answer implies unstated architectural trade-offs even if the answer itself is short (e.g., "REST" implies choices about state management, versioning, and contract evolution that are worth surfacing).

## Approach Presentation

### When to Present Approaches
Present 2-3 architectural approaches after gathering sufficient requirements (typically after covering scope, constraints, and technology preferences).

If `codebase_investigator` was used, present approaches only after incorporating its findings into the trade-off analysis. Do not treat the existing codebase structure as optional context.

### Approach Format

For each approach, provide:

```
### Approach [N]: [Descriptive Name]

**Summary**: [2-3 sentence overview]

**Architecture**:
[Component diagram or description showing key components and their relationships]

**Pros**:
- [Concrete advantage with context]
- [Another advantage]

**Cons**:
- [Concrete disadvantage with context]
- [Another disadvantage]

**Best When**: [Specific conditions where this approach excels]

**Risk Level**: Low | Medium | High
```

### Presentation Rules
- Always lead with your recommended approach
- Explain why the recommended approach best fits the gathered requirements
- Highlight the key differentiator between approaches
- After presenting all approaches, explicitly ask the user to choose
- Accept user's choice without pushback, even if it differs from your recommendation

### Recommendation Philosophy
- **Always identify the ideal long-term solution** — the approach that is architecturally sound, maintainable, and future-proof. Present it clearly so the user understands what "right" looks like.
- **When the long-term solution requires large-scale changes** that are disproportionate to the task at hand, also present a pragmatic alternative that accomplishes the goal without major disruption. Be explicit about the trade-off: "The ideal solution is X (because...), but a pragmatic path is Y (because the scope of X is disproportionate to the current need)."
- **Never default to the quick fix without surfacing the long-term option.** The user should always know what they're trading away. But equally, never recommend a large-scale refactor when the task can be accomplished safely with a targeted change.
- **Label each approach honestly**: which is the long-term investment, which is the pragmatic path, and which (if any) is a stopgap that will create debt.

### Decision Matrix

In Standard and Deep modes, after presenting the 2-3 approaches with narrative pros/cons, also present a decision matrix that scores each approach against the gathered requirements. In Quick mode, skip the matrix.

**Criteria derivation**: Derive 3-6 scoring criteria from the requirements and constraints gathered during the question phase. Use the user's stated priorities to assign weights (sum to 100%). If the user has not explicitly stated priorities, infer relative weights from the emphasis given during the question phase; equal weighting is acceptable as a last resort. If fewer than 3 meaningful criteria emerge, skip the matrix and use narrative-only recommendation.

**Scoring scale**: Score each approach on each criterion using a 1-5 scale: 1=poor fit, 3=adequate, 5=strong fit. Include a brief justification (1 sentence) in each cell.

**Matrix format**:

| Criterion | Weight | Approach A | Approach B | Approach C (if applicable) |
|-----------|--------|------------|------------|------------|
| [Criterion from requirements] | [%] | [1-5]: [justification] | [1-5]: [justification] | [1-5]: [justification] |
| **Weighted Total** | | [score] | [score] | [score] |

**Tie-breaking**: If approaches score within 1 point of each other in weighted totals, present the near-tie explicitly and use narrative judgment to break the tie, citing the single most decisive factor. Do not present a matrix-driven recommendation as definitive when the scores don't clearly differentiate.

**Non-differentiating criteria**: Criteria that score identically across all approaches may be noted but should be excluded from the matrix to keep it focused on differentiating factors. If removing non-differentiating criteria leaves fewer than 2 rows, skip the matrix and use narrative-only recommendation.

## Design Convergence Protocol

### Section-by-Section Presentation

Present the design document in sections, validating each before proceeding. Scale the number of sections to the task's complexity, but always present at least the **minimum set**.

**Minimum sections (always required, regardless of task complexity):**
1. Problem Statement
2. Approach (Selected Approach, Alternatives Considered)
3. Risk Assessment

**Full presentation order** (use for medium-to-complex tasks; matches `templates/design-document.md` structure):
1. Problem Statement
2. Requirements (Functional, Non-Functional, Constraints)
3. Approach (Selected Approach, Alternatives Considered, Decision Matrix)
4. Architecture (Component Diagram, Data Flow, Key Interfaces)
5. Agent Team
6. Risk Assessment
7. Success Criteria

**Complexity guidance:**
- **Simple** (static sites, single-file scripts, config changes): present the 3 minimum sections. Keep each to 100-150 words.
- **Medium** (multi-component features, API endpoints, integrations): present sections 1-3 and 6, plus up to 1 other section that surfaces meaningful trade-offs (cap at 5 total). 150-250 words each.
- **Complex** (new subsystems, cross-cutting refactors, multi-service architectures): present all 7 sections at 200-300 words each.

Never skip Problem Statement, Approach, or Risk Assessment. If you believe other sections add no value for the task, omit them — but state which sections you are skipping and why before presenting the first section.

### Validation Format

After each section, use `ask_user` with `type: 'yesno'` for approval. Do not rely on a separate assistant message for the section content. The `question` body itself must include the section title and the full section summary so the user can review the material directly in the approval prompt.

<!-- @feature geminiAskFormat -->
```json
{
  "questions": [
    {
      "header": "Approve",
      "question": "Section: [section name]\n\n[200-300 word section content]\n\nDoes this section accurately capture our discussion? Any changes needed before I proceed to [next section name]?",
      "type": "yesno"
    }
  ]
}
```

<!-- @end-feature -->
### Revision Protocol
- If user requests changes, revise the section and re-present
- Re-present revised content inside the next approval prompt as well; never ask for approval on a section summary the user cannot see in the prompt
- Track which sections are approved vs pending
- Do not proceed to the next section until current section is approved
- If a later section reveals issues with an earlier section, flag the conflict and propose resolution

### Section Reasoning Guide

Apply depth-gated reasoning enrichment to design section content during the convergence phase:

| Element | Quick | Standard | Deep |
|---------|-------|----------|------|
| Pros/cons on approaches | Yes | Yes | Yes |
| Recommendation narrative | Yes | Yes | Yes |
| Decision matrix scoring approaches | No | Yes | Yes |
| Rationale annotations on section decisions | No | Yes | Yes |
| Per-decision alternatives considered | No | No | Yes |
| Requirement traceability (`Traces To`) | No | No | Yes |

**Quick mode**: No reasoning annotations. Present sections as-is — current behavior preserved.

**Rationale annotations (Standard + Deep)**: For each key design decision within a section, include an inline explanation of why it was chosen, tied to specific project context from the question phase. A key decision is one that, if changed, would require reworking other parts of the design — routine or cosmetic choices (naming, formatting) are not key. Format: `[decision] — *[rationale referencing specific requirements, constraints, or user-stated preferences]*`

**Per-decision alternatives (Deep only)**: For key sub-decisions (choices within a section that affect the design's shape), briefly note what was considered and rejected. Format: `[decision] *(considered: [alternative A] — rejected because [reason]; [alternative B] — rejected because [reason])*`

**Requirement traceability (Deep only)**: Tag each key decision with `Traces To: REQ-N` referencing the numbered requirement it satisfies from the design document's Requirements section. Every requirement (functional and non-functional) should be traceable to at least one design decision. If the Requirements section was omitted due to complexity guidance (simple tasks), skip requirement traceability markers — rationale annotations and per-decision alternatives still apply.

**Uniform application**: Apply the chosen depth mode's reasoning rules uniformly to every section in the convergence phase. Do not selectively skip reasoning on some sections unless the adaptive elision rule applies (the decision is self-evident and requires no justification).

## Design Document Generation

### Output Location

The write path depends on whether Plan Mode is active:

<!-- @feature geminiStateContract -->
- **Plan Mode active**: Write to `~/.gemini/tmp/<project>/plans/YYYY-MM-DD-<topic-slug>-design.md` (the only writable location during Plan Mode). After `exit_plan_mode` approval in Phase 2, the orchestrator copies it to the permanent location.
- **Plan Mode not active**: Write directly to `<state_dir>/plans/YYYY-MM-DD-<topic-slug>-design.md` (`<state_dir>` resolves from `MAESTRO_STATE_DIR`).

Where:
- `YYYY-MM-DD` is the current date
- `<topic-slug>` is a lowercase, hyphenated summary of the task (e.g., `user-auth-system`, `data-pipeline-refactor`)
- `<project>` is the CLI's internal project hash (resolved automatically by `write_file`)
<!-- @end-feature -->
<!-- @feature claudeStateContract -->
- **Plan Mode active**: Write to `docs/maestro/plans/YYYY-MM-DD-<topic-slug>-design.md` (the only writable location during Plan Mode). After `exit_plan_mode` approval in Phase 2, the orchestrator copies it to the permanent location.
- **Plan Mode not active**: Write directly to `docs/maestro/plans/YYYY-MM-DD-<topic-slug>-design.md` (`docs/maestro` resolves from `MAESTRO_STATE_DIR`).

Where:
- `YYYY-MM-DD` is the current date
- `<topic-slug>` is a lowercase, hyphenated summary of the task (e.g., `user-auth-system`, `data-pipeline-refactor`)
- `<project>` is the CLI's internal project hash (resolved automatically by `write_file`)
<!-- @end-feature -->

### Document Structure
Use the design document template from `templates/design-document.md`. Include the `design_depth` field in the frontmatter, set to the depth mode chosen during the Design Depth Gate.

### Completion Criteria
The design document is complete when:
- All sections have been presented and approved by the user
- The agent team composition matches the task requirements
- Phase dependencies are clearly mapped
- Success criteria are measurable and specific
- The user has given explicit final approval of the complete document

### Post-Generation
After writing the design document:
1. Confirm the file path to the user
2. Summarize key decisions made during the dialogue
3. Ask if the user is ready to proceed to implementation planning (Phase 2)
