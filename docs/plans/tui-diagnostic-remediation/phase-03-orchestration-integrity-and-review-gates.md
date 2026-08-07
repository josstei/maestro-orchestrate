# Phase 3 — Orchestration Integrity and Mandatory Review Gates

## Objective

Make the orchestration lifecycle accurately represent delegation failures and prevent archival of implementation work that has not passed the required code review. A parent-orchestrator direct-write fallback must not be treated as successful agent execution.

## Findings Closed in This Phase

- F-01: degraded delegation cannot produce an overall successful orchestration result.
- F-02: direct implementation fallback is explicitly prohibited and recorded as non-compliant.
- F-03: code review becomes a server-enforced archive prerequisite for non-documentation changes.

## Architectural Decisions

### Delegation Failure

When registered-agent dispatch fails, times out, returns unusable output, or collapses into the parent context:

- the assigned phase is not completed;
- the parent orchestrator does not implement the phase;
- the failure is recorded;
- retry/re-scope/escalation follows the execution protocol;
- archive remains unavailable while required implementation phases are incomplete.

### Review Requirement

Code review is required when completed phase manifests contain any non-documentation file. Documentation-only runs may mark review `not_required`.

A zero finding count is not proof that a review occurred. Review completion must have a separate explicit state.

## Implementation Tasks

### 1. Add a Typed Completion-Review Contract

Add a session-level contract in the MCP state schema, recommended shape:

```yaml
completion_review:
  required: false
  status: not_required
  reviewer_agent: null
  reviewed_at: null
  reviewed_phase_ids: []
  finding_count: 0
  blocking_finding_count: 0
  reviewed_files: []
  summary: null
```

Status enum:

- `not_required`
- `pending`
- `passed`
- `blocked`

Modify:

- `src/mcp/contracts/session-state-schema.ts`
- `src/mcp/session/session-lifecycle-service.ts`
- session serialization/reading code as required
- readable/legacy schema paths so old sessions without the field can still load with a default

The initial state is `not_required`. When a completed phase reports a non-documentation created, modified, or deleted file, transition logic sets `required: true` and `status: pending` unless an existing blocked/passed review must be preserved according to the rules below.

### 2. Define Documentation-Only Classification Once

Add one shared predicate, recommended location under `src/mcp/session/` or `src/lib/`:

```typescript
isDocumentationPath(path): boolean
```

Document supported documentation patterns, including Markdown and repository documentation directories. Keep the rule conservative: files not clearly documentation count as implementation changes.

Use this predicate in transition, review, and archive code. Do not duplicate extension lists.

### 3. Add a `record_code_review` MCP Tool

Add a dedicated tool rather than overloading `transition_phase` or inferring review from `review_finding_count`.

Recommended arguments:

```typescript
{
  session_id: string;
  reviewed_phase_ids: PhaseId[];
  reviewer_agent: string;
  reviewed_files: string[];
  finding_count: number;
  blocking_finding_count: number;
  summary?: string;
}
```

Validation rules:

- active session and matching session ID required;
- reviewer must resolve to the canonical code-review agent or an explicitly permitted review agent;
- all reviewed phase IDs must exist and be completed;
- `reviewed_files` must cover the current non-documentation manifests for reviewed phases;
- counts are nonnegative integers;
- blocking count cannot exceed total finding count;
- blocking count greater than zero stores `blocked`;
- zero blocking findings stores `passed`;
- a later implementation transition affecting non-documentation files resets a prior `passed` review to `pending`;
- a blocked review cannot be converted to passed without a later review record after remediation.

Return the normalized persisted review state.

Register the tool through the canonical source tool pack and regenerate all runtime surfaces.

### 4. Enforce Review in `archive_session`

Before status mutation or file movement, `archiveSession` must reject when:

- a phase is incomplete;
- reconciliation is pending;
- completion review is required and status is `pending`;
- completion review status is `blocked`;
- review coverage does not include the current non-documentation file manifest.

Recommended structured codes:

- `CODE_REVIEW_REQUIRED`
- `CODE_REVIEW_BLOCKED`
- `CODE_REVIEW_STALE`

The check must occur before any archival side effect. Add atomicity tests proving failed archive attempts leave active state and plan files untouched.

### 5. Record Delegation Failures Without Completing the Phase

Add a server-supported way to persist a failed dispatch. Choose one coherent implementation:

- preferred: `record_phase_failure` tool with session ID, phase ID, agent, failure type, message, and retry count;
- acceptable: extend an existing phase-state update surface with an explicit failed transition that cannot include completion manifests.

Required behavior:

- set phase status to `failed`;
- append a structured error record;
- increment retry count when appropriate;
- keep current phase identifiable for resume;
- do not mark review pending because no completed implementation was accepted;
- do not allow archive while failed phases remain unresolved.

### 6. Tighten Orchestration Instructions

Modify canonical sources:

- `src/references/orchestration-steps.md`
- `src/skills/shared/execution/SKILL.md`
- `src/skills/shared/delegation/SKILL.md`
- Express workflow instructions in the orchestrator template/entry-point source
- session-management instructions where archive conditions are described

Required rules:

1. Agent dispatch must use the registered agent tool.
2. A failed dispatch is recorded as failure and retried/re-scoped/escalated.
3. Parent direct implementation is forbidden unless a separately designed, user-approved emergency mode exists; this phase does not introduce that mode.
4. `transition_phase` is called only for accepted agent work with a valid Task Report and downstream context.
5. `record_code_review` is called after reviewer output is parsed.
6. `archive_session` is called only after review passes or is server-classified not required.
7. Final summaries report artifact outcome, delegation outcome, protocol outcome, and archive outcome separately.

Regenerate runtime instructions and verify no generated copy retains the old fallback implication.

### 7. Preserve Resume Behavior

Update Express and standard resume logic:

- failed implementation phase: re-delegate or escalate;
- completed phase with `completion_review.status: pending`: run code review;
- blocked review: re-delegate fixes, then review again;
- passed review with session still active: archive may proceed;
- legacy session missing review state: derive required/pending from manifests rather than assuming passed.

### 8. Update Diagnostic Result Vocabulary

Define result labels usable by the report and final summary:

- `completed_compliant`
- `completed_documentation_only`
- `artifact_completed_orchestration_degraded`
- `failed_delegation`
- `blocked_review`
- `incomplete`

These labels may be derived for presentation rather than persisted if the state fields provide an unambiguous source. Do not add redundant persisted status unless needed by consumers.

## Focused Test Plan

### Unit Tests

Add tests for:

- documentation path predicate;
- completion-review defaulting for new and legacy sessions;
- review reset after new non-documentation changes;
- review count and coverage validation;
- blocked versus passed state;
- phase failure recording.

### Integration Tests

Add `tests/integration/code-review-archive-gate.test.js` covering:

1. non-documentation phase completes;
2. archive fails with `CODE_REVIEW_REQUIRED`;
3. review with blocking findings records `blocked`;
4. archive fails with `CODE_REVIEW_BLOCKED`;
5. remediation changes reset review to `pending`;
6. passing review records coverage;
7. archive succeeds;
8. documentation-only session archives without reviewer call;
9. failed delegation phase cannot archive;
10. failed archive leaves files and active state unchanged.

### Transform/Generated Tests

Assert every runtime-generated orchestration source contains:

- the no-direct-fallback rule;
- the review-recording step;
- the archive gate sequence.

## Validation Commands

```bash
npm run build
node --test tests/unit/*review*.test.js tests/unit/*phase-failure*.test.js
node --test tests/integration/code-review-archive-gate.test.js
npm run generate
npm run test:run
npm run check:source
```

## Deliverables

- Typed completion-review state.
- Shared documentation-path classifier.
- `record_code_review` tool.
- Delegation-failure persistence.
- Server-enforced archive gates.
- Updated canonical orchestration and resume instructions.
- Runtime-generation and regression coverage.

## Exit Gate

Phase 3 is complete when:

- a simulated failed coder dispatch cannot lead to a completed phase or successful archive;
- no canonical instruction authorizes parent direct implementation fallback;
- non-documentation changes cannot archive without explicit passing review state;
- zero findings without a recorded review cannot satisfy the gate;
- stale reviews are invalidated by later file changes;
- documentation-only archival remains supported;
- legacy active sessions load safely and are assigned a conservative review requirement;
- focused and generated-output tests pass with no source drift.
