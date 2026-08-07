# Phase 5 — Regression, Generated-Surface, and Multi-Runtime Verification

## Objective

Prove the Phase 1–4 behavior across source contracts, direct handlers, MCP SDK validation, generated runtime bundles, session lifecycle, archive atomicity, and evidence tooling. This phase closes testing gaps rather than merely running the existing suite.

## Test Strategy

Testing is layered because the original report conflated multiple execution boundaries:

1. Pure normalization and schema tests.
2. Direct service/handler tests.
3. MCP SDK boundary tests.
4. End-to-end session lifecycle tests.
5. Generated-runtime bundle tests.
6. Diagnostic evidence verifier tests.
7. Full source and release validation.

## Implementation Tasks

### 1. Build a Complete Input Compatibility Matrix

Create reusable fixtures for:

- canonical `get_agent` list;
- scalar canonical property;
- singular compatibility alias;
- missing fields;
- both fields;
- whitespace/empty values;
- invalid array members;
- duplicate values;
- canonical plan phase;
- single-entry phase alias;
- zero/multiple-entry phase aliases;
- both phase fields.

Use the same fixture data in unit and runtime-bundle integration tests so source and generated surfaces cannot drift in accepted behavior.

### 2. Verify Both Validation Layers

Add explicit tests showing:

- malformed MCP payload rejected by SDK/tool schema or normalized handler contract as designed;
- malformed direct service payload rejected by defense-in-depth validation;
- canonical payload reaches `validatePhases` and succeeds;
- compatibility payload is normalized before canonical validation;
- error codes identify the correct layer.

The tests must make the boundary distinction visible in names and assertions.

### 3. Extend Design-Gate Coverage

Retain existing approved-mismatch tests and add/confirm:

- stale unapproved gate for another session does not produce `DESIGN_GATE_SESSION_MISMATCH`;
- approved gate for another session with no current gate does produce mismatch;
- approved gate for another session plus matching current gate does not produce mismatch;
- current unapproved gate produces `DESIGN_GATE_UNAPPROVED`;
- cleanup avoids the condition but is not treated as proof of a reproduced failure;
- archive removes only the matching session gate.

### 4. Add Implementation-Plan Path Matrix

Add integration tests for `resolveImplementationPlan` and `create_session`:

| Case | Expected |
| --- | --- |
| existing workspace-relative path | succeeds and materializes under plans |
| existing absolute path | succeeds when accessible |
| literal `~/.gemini/...` | resolves literally/workspace-relative and fails unless such path exists |
| missing relative path | `NOT_FOUND` |
| deleted temp absolute path | `NOT_FOUND` |
| valid content + safe filename | succeeds |
| content without filename | validation failure |
| unsafe filename | validation failure |
| both path and content variants | mutually exclusive failure |

Assertions must check structured codes and no partial file creation on failure.

### 5. Verify Orchestration Integrity and Review Gates

Exercise:

- failed dispatch record;
- retry count and error persistence;
- resume of failed phase;
- completed implementation with pending review;
- blocking review;
- remediation change invalidating old review;
- passing review;
- documentation-only review exemption;
- archive refusal and eventual success;
- failed archive atomicity;
- legacy session review-state derivation.

Add an integration scenario modeled on the original TUI run: coder dispatch fails, parent does not write files, phase remains unresolved, and archive fails. This is the direct regression for F-01 through F-03.

### 6. Verify Every Runtime Bundle

Extend `RUNTIME_BUNDLES` coverage in `tests/integration/mcp-server-bundle-behavior.test.js` for:

- Gemini-family default;
- Qwen runtime;
- Claude bundle;
- Codex executable;
- packaged Claude runtime where applicable.

For every bundle, assert:

- canonical and accepted compatibility `get_agent` inputs;
- invalid input rejection and stable errors;
- `record_code_review` tool presence;
- review/archival behavior where workspace integration permits;
- canonical tool names remain snake-case;
- generated descriptions/documentation reflect canonical input.

### 7. Verify Generated Instruction Surfaces

Extend transform tests to assert generated runtime instructions contain:

- exact session-ID invariance rule;
- correct approved design-gate mismatch wording;
- content/path plan semantics;
- no parent direct implementation fallback;
- `record_code_review` before archive;
- separate outcome dimensions in summaries.

Run generation and assert clean git diff.

### 8. Verify Diagnostic Evidence Semantics

Run all Phase 4 fixtures and add a full synthetic run fixture linking:

- timeline;
- MCP calls;
- artifact manifest;
- failed/passed delegation variants;
- review variants;
- test output;
- report evidence references.

The verifier must reject each contradictory combination independently.

### 9. Validate Test-Count Reporting

Do not hard-code expected total suite/case counts in documentation. Instead:

- capture actual `npm test` output;
- parse counts when supported;
- include parser confidence/status;
- verify the report generator omits counts when parser confidence is insufficient;
- verify zero exit code and zero failures are separate claims.

### 10. Execute Full Repository Gates

Run from a clean checkout or clean worktree of the target branch:

```bash
npm ci
npm run typecheck
npm run typecheck:type-tests
npm test
npm run check:source
npm run check:release
```

Also run focused test files individually to preserve failure localization in evidence.

Capture:

- command;
- start/end time;
- exit code;
- stdout/stderr hash;
- parsed summary;
- source commit;
- dirty state before and after.

## Expected Test Files

Add or extend at least:

- `tests/unit/input-compatibility.test.js`
- `tests/unit/design-gate.test.js`
- `tests/unit/diagnostic-evidence.test.js`
- `tests/unit/diagnostic-redaction.test.js`
- `tests/integration/plan-contract.test.js`
- `tests/integration/mcp-server-bundle-behavior.test.js`
- `tests/integration/code-review-archive-gate.test.js`
- implementation-plan document repository tests
- transform tests for generated orchestration/session/content packs
- type tests for normalized/canonical contracts

Use actual existing filenames where an established test module already owns the concern; do not create duplicate test silos unnecessarily.

## Coverage Matrix

| Concern | Unit | Direct Service | MCP Integration | Runtime Bundles | Evidence Fixture |
| --- | --- | --- | --- | --- | --- |
| `get_agent` normalization | Yes | Yes | Yes | Yes | Call record |
| phase agent normalization | Yes | Yes | Yes | Generated pack | Call record |
| design-gate mismatch | Yes | Yes | Yes | N/A | Outcome record |
| plan path behavior | Yes | Yes | Yes | Relevant runtime | Path fixture |
| delegation failure | Yes | Yes | Yes | Generated instructions | Outcome record |
| review archive gate | Yes | Yes | Yes | Tool presence | Outcome record |
| evidence integrity | Yes | N/A | CLI | N/A | Yes |
| unsupported quality claims | Semantic validator | N/A | N/A | N/A | Yes |

## Failure Policy

- Fix every failure introduced or exposed by the implementation, regardless of severity.
- Do not mute tests, broaden assertions, or update snapshots without explaining the behavioral contract.
- Do not classify pre-existing failures as out of scope without reproducing them on the baseline commit and documenting the comparison.
- Do not proceed to Phase 6 with skipped runtime bundles or missing release checks.

## Deliverables

- Complete regression matrix.
- Cross-runtime bundle validation.
- Generated-surface drift checks.
- Full clean-checkout source and release results.
- Captured validation evidence suitable for Phase 6.

## Exit Gate

Phase 5 is complete when:

- every audit finding has at least one direct regression test or evidence-semantic test;
- all accepted and rejected compatibility forms behave identically across applicable runtime bundles;
- design-gate and path wording exactly match tested behavior;
- coder-dispatch failure cannot archive or be reported as compliant success;
- non-documentation work cannot archive without passing review;
- generated sources are clean after generation;
- `npm test`, `check:source`, and `check:release` pass from a clean checkout;
- validation outputs are captured under the Phase 4 evidence contract;
- no test or runtime surface is deferred to Phase 6.
