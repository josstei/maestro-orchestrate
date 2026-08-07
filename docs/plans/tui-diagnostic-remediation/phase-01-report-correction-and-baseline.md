# Phase 1 — Report Correction and Auditable Baseline

## Objective

Correct `docs/diagnostic-report-tui-eval.md` so it is an accurate baseline for subsequent implementation. This phase changes the report and supporting documentation only; it does not claim that runtime defects are fixed.

## Findings Closed in This Phase

- F-01: incorrect overall success classification.
- F-02: direct-write fallback characterized as successful recovery.
- F-03: missing mandatory code-review evidence.
- F-04: SDK boundary versus service validation ambiguity.
- F-05: overly broad design-gate mismatch condition.
- F-06: incorrect relative-path failure statement.
- F-07: unsupported frequency language.
- F-10: unverified runtime details presented as established facts.
- F-11: unsupported production-readiness language.

These findings are documentation-corrected here. Runtime enforcement and evidence automation remain assigned to later phases.

## Source Grounding to Preserve

The corrected report must accurately reflect the branch implementation:

1. `create_session` registers `phases` as an array of `WirePlanPhaseSchema` values.
2. Canonical plan phases use singular `agent`; persisted session phases use `agents` arrays.
3. Normal MCP calls can fail at the registered Zod input boundary before `createSession` calls `validatePhases`.
4. `DESIGN_GATE_SESSION_MISMATCH` is based on approved gates for a different session ID, with the current-session gate exception preserved.
5. `implementation_plan` accepts absolute or workspace-relative paths. It fails when the server-resolved path is absent or inaccessible.
6. A literal `~` prefix is not shell-expanded by Node path resolution and is therefore not equivalent to an absolute home-directory path.
7. `implementation_plan_content` plus `implementation_plan_filename` avoids external source-path resolution but still performs filename, content, and filesystem validation.
8. `get_agent` is registered by the exact snake-case name and canonically expects a nonempty `agents` array.
9. The Express workflow requires registered-agent dispatch and code review. Direct implementation by the parent orchestrator is not an approved fallback.

## Implementation Tasks

### 1. Add Report Metadata

Add a metadata section immediately below the title containing:

- evaluated repository and branch;
- evaluated commit SHA;
- report generation date;
- evidence bundle location, initially marked unavailable;
- report status: `provisional / audit-corrected`;
- explicit statement that runtime observations without evidence are unverified.

### 2. Replace the Single Success Result

Replace the `SUCCESS` total with a result matrix:

| Dimension | Required Classification |
| --- | --- |
| Requested artifacts created | `reported successful; unverified from committed evidence` |
| Session creation/transition/archive calls | `reported successful; unverified from committed evidence` |
| Assigned implementation-agent execution | `failed or degraded` |
| Parent fallback implementation | `protocol violation, not recovery success` |
| Mandatory code review | `not evidenced` |
| Overall orchestration | `artifact-successful but protocol-noncompliant` |

Update the timeline row for implementation to explicitly identify the delegation failure and parent direct-write behavior. Do not use a green-success label for that row.

### 3. Correct `create_session` Failure-Layer Language

Document two separate paths:

- External MCP path: registered input schema rejects malformed phase shapes before the handler.
- Internal/direct service path: `validatePhases` reports missing or invalid canonical fields as defense-in-depth.

Do not assert that every malformed MCP call reaches `validatePhases`.

### 4. Correct Design-Gate Semantics

Replace the orphan-file explanation with the exact condition:

- gate is approved;
- gate belongs to another session ID;
- current session lacks its own gate;
- `create_session` raises `DESIGN_GATE_SESSION_MISMATCH`.

Document the distinct `DESIGN_GATE_UNAPPROVED` path for the current session. Change any statement that cleanup “verified” causality to “avoided the condition” unless a failing and succeeding trace is attached.

### 5. Correct Implementation-Plan Path Semantics

Split path behavior into four cases:

1. Workspace-relative existing path: supported.
2. Absolute existing path in the same filesystem namespace: supported.
3. Tilde-prefixed path: treated as a literal relative path unless expanded by the caller; likely not found.
4. Absolute path outside the server namespace, deleted temporary file, or permission-denied file: unavailable to the server.

Describe the content variant as source-path-independent materialization, not as bypassing filesystem checks.

### 6. Correct `get_agent` Findings

Retain the code-proven statement that malformed scalar or alias input fails under the current contract. Replace phrases such as “routinely,” “consistently,” or “frequently” with one of:

- “observed in the evaluated run,” when a trace is later attached;
- “a plausible model-generated error shape,” when based only on code inspection;
- a measured frequency derived from the Phase 4 evidence set.

State that `getAgent` is not a registered alias and therefore fails tool lookup.

### 7. Mark All Runtime Claims by Evidence Status

Annotate or rewrite exact claims for:

- stage duration;
- total duration;
- model identifier;
- tmux session name;
- file size;
- archive path;
- test-suite and test-case totals;
- zero failures;
- visual quality;
- production readiness.

Until Phase 4 supplies evidence, mark them `unverified`. Keep them in the report only when useful as assertions to validate later.

### 8. Remove Unsupported Quality Conclusions

Replace “production-ready” with “complete static landing-page implementation was reported as generated.”

Create a separate production-readiness criteria subsection listing the evidence required before that term may be used:

- standards-compliant HTML;
- accessibility result;
- responsive viewport result;
- browser/console validation;
- link and asset validation;
- mandatory code review;
- no blocking findings.

### 9. Add a Remediation Status Appendix

Add F-01 through F-11 with status values:

- `document-corrected`;
- `implementation-pending`;
- `evidence-pending`;
- `closed`.

At the end of Phase 1, no code-level finding should be marked closed.

## Files to Modify

- `docs/diagnostic-report-tui-eval.md`

Optional supporting file, only when the report becomes too dense:

- `docs/evidence/tui-eval/README.md`

Do not create fabricated run artifacts in this phase.

## Validation

1. Review every categorical statement in the report and assign an evidence classification.
2. Verify all code-grounded statements against the baseline branch, not `main`.
3. Verify no sentence states that all relative paths fail.
4. Verify no sentence states that any stale unapproved gate triggers the mismatch.
5. Verify the overall result does not say successful end-to-end orchestration.
6. Verify code review is listed as missing evidence.
7. Run Markdown formatting/link checks if available in repository tooling.

## Deliverables

- Corrected baseline report.
- Finding-status appendix mapping all audit findings to later phases.
- No runtime behavior change.

## Exit Gate

Phase 1 is complete when an independent reviewer can answer every one of these questions from the report without inference:

- What artifacts were reportedly produced?
- Did the assigned implementation agent complete successfully?
- Did the parent orchestrator write implementation files?
- Was that behavior protocol-compliant?
- Was code review performed?
- Which statements are code-grounded, runtime-evidenced, inferred, or unverified?

No report-accuracy issue may be deferred to Phase 6. Phase 6 may replace provisional facts with evidence, but it must not discover basic semantic corrections left undone here.
