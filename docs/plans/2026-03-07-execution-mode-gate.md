# Execution Mode Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the execution mode prompt fire reliably with a plan-based parallel/sequential recommendation when `MAESTRO_EXECUTION_MODE=ask`.

**Architecture:** Strengthen the execution skill's mode gate as the single source of truth, with lightweight pointers from command prompts and GEMINI.md creating redundant enforcement. No new files, no code changes — prompt-level modifications only.

**Tech Stack:** Gemini CLI extension system (Markdown skills, TOML commands, `ask_user` tool)

**Design doc:** `docs/plans/2026-03-07-execution-mode-gate-design.md`

---

### Task 1: Rewrite execution skill mode gate

**Files:**
- Modify: `skills/execution/SKILL.md:10-23`

**Step 1: Replace the "Execution Mode Gate" section**

Replace lines 10-23 (the current `## Execution Mode Gate` section) with the strengthened version below. This replaces everything from `## Execution Mode Gate` up to (but not including) `## State File Access`.

Old content (lines 10-23):
```markdown
## Execution Mode Gate

Before executing any phases:

1. Read `MAESTRO_EXECUTION_MODE` (default: `ask`)
2. If `ask`, prompt for `parallel` or `sequential`
3. Record the selected mode in session state as `execution_mode`
4. Record `execution_backend: native`
5. Use the selected mode for the remainder of the session unless the user changes it

Mode-specific behavior:

- If `parallel` is selected and a ready batch has only one phase, execute it sequentially
- If `sequential` is selected, preserve plan order even when phases are parallel-safe
```

New content:
```markdown
## Execution Mode Gate

<HARD-GATE>
This gate MUST resolve before ANY delegation proceeds. Do not skip it. Do not defer it. Do not begin delegating to subagents until execution_mode is recorded in session state. If you reach a delegation step and execution_mode is not set, STOP and return here.
</HARD-GATE>

### Step 1 — Read the configured mode

Read `MAESTRO_EXECUTION_MODE` (default: `ask`).

- If `parallel`: record `execution_mode: parallel` and `execution_backend: native` in session state. Skip to delegation.
- If `sequential`: record `execution_mode: sequential` and `execution_backend: native` in session state. Skip to delegation.
- If `ask`: proceed to Step 2.

### Step 2 — Analyze the implementation plan

Before prompting the user, analyze the approved plan to generate a recommendation:

1. Count total phases in the plan
2. Count phases marked `parallel: true` (parallelizable phases)
3. Count distinct parallel batches (groups of parallelizable phases at the same dependency depth)
4. Count sequential-only phases (phases with `blocked_by` dependencies that prevent parallelization)
5. Check for any overlapping file ownership warnings across parallel-eligible phases

Record these counts — they feed into the prompt.

### Step 3 — Determine the recommendation

- If parallelizable phases > 50% of total phases → recommend **parallel**
- If parallelizable phases ≤ 1 → recommend **sequential**
- The recommended option appears first in the `ask_user` options list with "(Recommended)" appended to its label

### Step 4 — Prompt the user

Call `ask_user` with `type: 'choice'`. The question must include the plan analysis numbers so the user can make an informed decision.

When parallel is recommended:

```json
{
  "questions": [{
    "header": "Exec mode",
    "question": "Execution Mode: [N] of [M] phases are parallelizable in [B] batches. How should phases be executed?",
    "type": "choice",
    "options": [
      {
        "label": "Parallel (Recommended)",
        "description": "[N] phases run concurrently in [B] batches. Faster execution but agents run autonomously."
      },
      {
        "label": "Sequential",
        "description": "All [M] phases run one at a time in plan order. Slower but allows step-by-step review."
      }
    ]
  }]
}
```

When sequential is recommended (parallelizable ≤ 1):

```json
{
  "questions": [{
    "header": "Exec mode",
    "question": "Execution Mode: Only [N] of [M] phases can run in parallel. How should phases be executed?",
    "type": "choice",
    "options": [
      {
        "label": "Sequential (Recommended)",
        "description": "Phases run one at a time in plan order. Best for this plan's dependency structure."
      },
      {
        "label": "Parallel",
        "description": "Parallel batching available for [N] phase(s). Limited benefit for this plan."
      }
    ]
  }]
}
```

Replace `[N]`, `[M]`, and `[B]` with actual counts from Step 2.

### Step 5 — Record and proceed

1. Record the user's selection in session state as `execution_mode`
2. Record `execution_backend: native`
3. Use the selected mode for the remainder of the session unless the user changes it

### Mode-specific behavior

- If `parallel` is selected and a ready batch has only one phase, execute it sequentially
- If `sequential` is selected, preserve plan order even when phases are parallel-safe

### Safety fallback

If `execution_mode` is not present in session state at the point where delegation is about to begin, STOP. Do not default to sequential. Return to this gate and resolve it. This catches any edge case where the gate was skipped.
```

**Step 2: Verify the edit**

Read `skills/execution/SKILL.md` and confirm:
- The `<HARD-GATE>` block is present at the top of the section
- Steps 1-5 are complete with the `ask_user` JSON examples
- The safety fallback subsection is present at the end
- The `## State File Access` section immediately follows (unchanged)

**Step 3: Commit**

```bash
git add skills/execution/SKILL.md
git commit -m "fix: strengthen execution mode gate with HARD-GATE and plan-based recommendation"
```

---

### Task 2: Update orchestrate.toml command prompt

**Files:**
- Modify: `commands/maestro/orchestrate.toml:22`

**Step 1: Replace step 11 and shift subsequent steps**

In `commands/maestro/orchestrate.toml`, replace line 22:

Old:
```
11. Begin execution phase by phase, delegating to subagents
```

New:
```
11. Activate the execution skill and resolve the execution mode gate (parallel vs sequential) BEFORE any delegation — this is mandatory
12. Execute phases according to the resolved mode, delegating to subagents
```

And update the subsequent step numbers:

Old:
```
12. Update session state after each phase completion
13. Before completion/archival, run a final `code_reviewer` quality gate if execution changed non-documentation files; block completion on unresolved Critical/Major findings
```

New:
```
13. Update session state after each phase completion
14. Before completion/archival, run a final `code_reviewer` quality gate if execution changed non-documentation files; block completion on unresolved Critical/Major findings
```

**Step 2: Verify the edit**

Read `commands/maestro/orchestrate.toml` and confirm:
- Steps are numbered 1-14 (was 1-13)
- Step 11 explicitly mentions "execution mode gate" and "mandatory"
- Step 12 says "according to the resolved mode"

**Step 3: Commit**

```bash
git add commands/maestro/orchestrate.toml
git commit -m "fix: add mandatory execution mode gate to orchestrate command"
```

---

### Task 3: Update execute.toml command prompt

**Files:**
- Modify: `commands/maestro/execute.toml:27`

**Step 1: Insert execution mode gate step**

In `commands/maestro/execute.toml`, the current step 5 is:

```
5. Execute phases according to the plan, following the execution skill's protocols
```

Replace steps 5-10 with renumbered steps that include the new gate:

Old (steps 5-10):
```
5. Execute phases according to the plan, following the execution skill's protocols
6. Activate the `validation` skill to verify outputs after each phase
7. Update session state after every phase transition
8. Before archival, run a final `code_reviewer` gate when execution changed non-documentation files
9. Block completion on unresolved Critical/Major review findings; remediate, re-validate, and re-review
10. On completion, archive the session and deliver the final summary
```

New (steps 5-11):
```
5. Resolve the execution mode gate (parallel vs sequential) from the execution skill BEFORE beginning phase execution — this is mandatory
6. Execute phases according to the resolved mode, following the execution skill's protocols
7. Activate the `validation` skill to verify outputs after each phase
8. Update session state after every phase transition
9. Before archival, run a final `code_reviewer` gate when execution changed non-documentation files
10. Block completion on unresolved Critical/Major review findings; remediate, re-validate, and re-review
11. On completion, archive the session and deliver the final summary
```

**Step 2: Verify the edit**

Read `commands/maestro/execute.toml` and confirm:
- Steps are numbered 1-11 (was 1-10)
- Step 5 explicitly mentions "execution mode gate" and "mandatory"
- Step 6 says "according to the resolved mode"

**Step 3: Commit**

```bash
git add commands/maestro/execute.toml
git commit -m "fix: add mandatory execution mode gate to execute command"
```

---

### Task 4: Update GEMINI.md with lightweight pointers

**Files:**
- Modify: `GEMINI.md:80-104`

**Step 1: Add execution mode gate line to Phase 3**

In `GEMINI.md`, the Phase 3 section (lines 80-85) currently reads:

```markdown
### Phase 3: Execute

- Activate `execution` and `delegation`.
- Activate `validation` for quality gates.
- Keep `write_todos` in sync with execution progress.
- Update session state after each phase or parallel batch.
```

Replace with:

```markdown
### Phase 3: Execute

- Activate `execution` and `delegation`.
- **Resolve execution mode gate** before any delegation (mandatory — see execution skill).
- Activate `validation` for quality gates.
- Keep `write_todos` in sync with execution progress.
- Update session state after each phase or parallel batch.
```

**Step 2: Update the Execution Mode Protocol section**

The current section (lines 96-104) reads:

```markdown
## Execution Mode Protocol

`MAESTRO_EXECUTION_MODE` controls execute behavior:

- `ask`: prompt user before execute phase
- `parallel`: run ready phases as native parallel subagent batches
- `sequential`: run one phase at a time without prompting

Record selected mode in session state as `execution_mode`. Set `execution_backend: native`.
```

Replace with:

```markdown
## Execution Mode Protocol

`MAESTRO_EXECUTION_MODE` controls execute behavior:

- `ask`: prompt user before execute phase with plan-based recommendation
- `parallel`: run ready phases as native parallel subagent batches
- `sequential`: run one phase at a time without prompting

The execution skill's mode gate is the authoritative protocol. It analyzes the implementation plan and presents a recommendation via `ask_user`. The gate must resolve before any delegation proceeds.

Record selected mode in session state as `execution_mode`. Set `execution_backend: native`.
```

**Step 3: Verify the edit**

Read `GEMINI.md` and confirm:
- Phase 3 has the bold "Resolve execution mode gate" line as its second bullet
- The Execution Mode Protocol section includes the "authoritative protocol" paragraph
- The `ask` description mentions "plan-based recommendation"
- No other sections were affected

**Step 4: Commit**

```bash
git add GEMINI.md
git commit -m "fix: add execution mode gate pointers to orchestrator context"
```

---

### Task 5: Final verification

**Step 1: Verify all 4 files are consistent**

Read each file and confirm cross-references are correct:

1. `skills/execution/SKILL.md` — has HARD-GATE, plan analysis, `ask_user` format, safety fallback
2. `commands/maestro/orchestrate.toml` — step 11 references "execution mode gate" as mandatory
3. `commands/maestro/execute.toml` — step 5 references "execution mode gate" as mandatory
4. `GEMINI.md` — Phase 3 bullet and Execution Mode Protocol section point to execution skill

**Step 2: Verify `ask_user` call format aligns with Gemini CLI**

Check that:
- `header: "Exec mode"` is ≤ 16 characters (9 chars — passes)
- `type: 'choice'` is a valid type enum value (`choice`, `text`, `yesno`)
- Options have `label` and `description` fields
- 2 options provided (within 2-4 range)

Reference: `../gemini-cli/packages/core/src/tools/definitions/model-family-sets/gemini-3.ts:611-687`

**Step 3: Run existing tests to confirm no regressions**

Run: `node tests/run-all.js`
Expected: All tests pass (changes are prompt-only, no code modified)
