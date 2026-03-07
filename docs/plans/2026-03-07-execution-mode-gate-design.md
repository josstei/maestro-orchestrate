# Execution Mode Gate — Reliable Prompt with Plan-Based Recommendation

## Problem Statement

The execution skill defines an "Execution Mode Gate" at Phase 3 entry that should prompt the user to choose between parallel and sequential execution when `MAESTRO_EXECUTION_MODE=ask` (the default). In practice, the orchestrator skipped this gate and went straight to sequential execution without asking.

**Root cause:** The gate is written as advisory guidance. There is no hard-gate language, no redundant enforcement in the command prompts, and no plan analysis to make the prompt useful.

**Goal:**

1. Make the execution mode gate reliably fire every time `MAESTRO_EXECUTION_MODE=ask`
2. Present a plan-aware recommendation based on dependency graph analysis
3. Use Gemini CLI's `ask_user` tool with `type: 'choice'` for a structured prompt
4. Centralize the gate logic in the execution skill; use lightweight pointers from command prompts and GEMINI.md

## Approach

**Option B: Skill-only centralization** — strengthen the execution skill's mode gate in place, add lightweight pointers from `orchestrate.toml`, `execute.toml`, and `GEMINI.md`.

Selected over:
- Protocol file (adds indirection; protocols are for delegation injection, not orchestrator self-governance)
- GEMINI.md inline (bloats always-loaded context)
- Prompt-only or command-only enforcement (single point of failure)

## Architecture

### Files Modified (4 files, 0 created)

1. **`skills/execution/SKILL.md`** — primary change
   - Rewrite "Execution Mode Gate" with HARD-GATE language
   - Add plan analysis protocol for generating recommendations
   - Specify exact `ask_user` call format
   - Add safety fallback: if `execution_mode` not in session state when delegation is about to happen, STOP and run the gate

2. **`commands/maestro/orchestrate.toml`** — reinforcement
   - Update step 11 to explicitly require resolving execution mode via the execution skill before any delegation

3. **`commands/maestro/execute.toml`** — reinforcement
   - Add execution mode resolution requirement before execution begins

4. **`GEMINI.md`** — lightweight pointer
   - Add one line to Phase 3 description
   - Update Execution Mode Protocol section to reference the execution skill as authoritative source

### What Stays the Same

- `MAESTRO_EXECUTION_MODE` setting and its three values (`ask`, `parallel`, `sequential`)
- Session state schema (`execution_mode`, `execution_backend`)
- Delegation skill, planning skill, and all protocols
- All hook behavior
- `gemini-extension.json`

## Detailed Gate Design

### Gate Flow

```
1. Read MAESTRO_EXECUTION_MODE env var (default: "ask")
   |
   ├─ "parallel" → record in session state, skip prompt
   ├─ "sequential" → record in session state, skip prompt
   └─ "ask" → proceed to plan analysis and prompt
         |
2. Analyze the approved implementation plan:
   - Count total phases
   - Count phases with parallel: true
   - Count distinct parallel batches (groups at same dependency depth)
   - Count sequential-only phases (those with blocking dependencies)
   - Note if any phases have overlapping file ownership warnings
         |
3. Generate recommendation:
   - If parallelizable > 50% of total → recommend parallel
   - If parallelizable ≤ 1 → recommend sequential
   - Include the numbers in the recommendation description
         |
4. Call ask_user with type: 'choice':
   - header: "Exec mode"
   - question: includes the plan analysis summary
   - options: parallel (with batch count), sequential (with rationale)
   - Recommended option listed first with "(Recommended)" suffix
         |
5. Record selected mode in session state as execution_mode
6. Record execution_backend: native
7. Proceed to delegation
```

### ask_user Call Format

Aligned with Gemini CLI's `ask_user` schema (`type: 'choice'`, header ≤ 16 chars, 2-4 options):

```json
{
  "questions": [{
    "header": "Exec mode",
    "question": "Execution Mode: [N] of [M] phases are parallelizable in [B] batches. How should phases be executed?",
    "type": "choice",
    "options": [
      {
        "label": "Parallel (Recommended)",
        "description": "[N] phases run concurrently in [B] batches. Faster but agents run autonomously."
      },
      {
        "label": "Sequential",
        "description": "Phases run one at a time in plan order. Slower but allows step-by-step review."
      }
    ]
  }]
}
```

Option order and "(Recommended)" placement flip based on analysis. If parallelizable ≤ 1, sequential is recommended first.

### Safety Fallback

If `execution_mode` is not set in session state when the first delegation is about to happen, the orchestrator must STOP and run the gate. This catches edge cases where the skill is activated but the gate section is skipped.

## Command Prompt Changes

### orchestrate.toml

Current step 11:
```
11. Begin execution phase by phase, delegating to subagents
```

Changed to:
```
11. Activate the execution skill. Resolve the execution mode gate (parallel vs sequential) BEFORE any delegation — this is mandatory
12. Execute phases according to the resolved mode, delegating to subagents
```

### execute.toml

Insert before current step 5:
```
5. Activate the execution skill. Resolve the execution mode gate (parallel vs sequential) BEFORE beginning execution — this is mandatory
```

### GEMINI.md

Phase 3 description — add after "Activate `execution` and `delegation`":
```
- **Resolve execution mode gate** before any delegation (mandatory — see execution skill).
```

Execution Mode Protocol section — add:
```
The execution skill's mode gate is the authoritative protocol. It must resolve before any delegation proceeds.
```

## Gemini CLI Alignment

- `ask_user` call uses `type: 'choice'` with `header` ≤ 16 characters — validated by Gemini CLI
- Options use `label` (1-5 words) and `description` — matches the tool schema
- No new tools or CLI features required
- Compatible with both plan mode and normal mode entry paths

## Risk Assessment

**Risk Level: Low**

- Changes are prompt-level only — no code, no schema changes, no new dependencies
- The gate is additive (makes an existing gate stronger), not a new feature
- Fallback safety net catches edge cases without breaking existing flows
- All changes are backwards-compatible with `MAESTRO_EXECUTION_MODE=parallel` or `sequential` (those skip the prompt entirely)
