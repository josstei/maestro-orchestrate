# Phase 4 — Diagnostic Evidence and Reproducibility

## Objective

Create a durable evidence contract and tooling so the TUI diagnostic report can be independently verified. Exact timings, model identity, tool calls, file properties, tests, delegation outcomes, and review outcomes must be traceable to committed, redacted evidence.

## Findings Closed in This Phase

- F-06: path behavior becomes reproducibly demonstrated rather than loosely described.
- F-07: occurrence-frequency claims require captured observations.
- F-10: runtime and test assertions gain committed evidence.
- F-11: quality/readiness labels gain objective criteria or remain qualified.

## Evidence Directory Contract

Use a tracked location outside ignored Maestro runtime state:

```text
docs/evidence/tui-eval/<run-id>/
├── manifest.json
├── environment.json
├── timeline.json
├── mcp-calls.redacted.jsonl
├── orchestration-outcome.json
├── artifact-manifest.json
├── delegation-outcome.json
├── code-review-outcome.json
├── validation-output.txt
├── production-readiness.json
└── run-summary.md
```

`<run-id>` should include an ISO date/time-safe component and a short source commit, for example `2026-08-07T041500Z-d67aab4`.

Large, secret-bearing, or ignored generated artifacts do not need to be committed. Their metadata and cryptographic hashes do.

## Implementation Tasks

### 1. Define a Versioned Evidence Manifest

Add a TypeScript/Zod contract, recommended path:

- `src/tooling/diagnostics/evidence-schema.ts`

`manifest.json` must include:

- schema version;
- run ID;
- repository URL/name;
- branch;
- source commit SHA;
- dirty-state flag and diff hash;
- runtime name and version;
- model identifier as returned by the runtime;
- Node/npm/platform metadata;
- start/end timestamps;
- evidence file inventory with SHA-256 hashes;
- redaction policy version;
- overall outcome dimensions;
- report path consuming the evidence.

Reject unknown future-required fields only according to the repository’s compatibility policy. Preserve readable error messages for missing evidence.

### 2. Capture Monotonic Timeline Data

Add a helper, recommended path:

- `src/tooling/diagnostics/timeline-recorder.ts`

Each event records:

- monotonic offset in milliseconds;
- wall-clock ISO timestamp;
- stage ID;
- operation/tool name;
- start/end or duration;
- outcome;
- linked MCP call IDs;
- optional error code.

Do not reconstruct precise durations from human-readable terminal output. The capture source must produce machine-readable timing records.

The sum of stage durations need not equal wall duration when operations overlap; the report generator must label parallel/overlapping timing correctly.

### 3. Capture and Redact MCP Calls

Define a JSONL call record:

- call ID;
- tool name exactly as registered;
- normalized request-shape metadata;
- start/end offsets;
- result status;
- structured error code;
- selected non-sensitive response metadata.

Redact or hash:

- prompts and user task text when sensitive;
- absolute home paths;
- tokens, credentials, environment secrets;
- repository-private content not required to prove the claim;
- generated page content unless intentionally approved for publication.

Add deterministic redaction tests. The verifier must reject known secret patterns.

### 4. Generate an Artifact Manifest

Add a command/helper, recommended paths:

- `src/tooling/diagnostics/artifact-manifest.ts`
- `src/tooling/verify-diagnostic-evidence.ts`

For each generated file, record:

- relative path;
- byte size from filesystem metadata;
- SHA-256;
- MIME/content category;
- created/modified classification from git or run manifest;
- whether the file is tracked or ignored;
- validation results associated with the artifact.

This replaces unverified narrative statements such as “13.5 KB” with generated values.

### 5. Capture Orchestration Integrity Outcomes

`orchestration-outcome.json` must separately record:

- workspace initialization;
- complexity classification;
- brief/design approval;
- session creation;
- assigned agent dispatch;
- phase transition;
- reconciliation status;
- code-review status;
- archival status;
- protocol-compliance result.

`delegation-outcome.json` must identify:

- assigned agent;
- registered dispatch tool;
- attempt count;
- success/failure;
- failure code/message hash;
- whether parent direct implementation occurred;
- escalation/retry result.

A run with parent direct implementation must be mechanically classified as non-compliant.

### 6. Capture Code Review Evidence

`code-review-outcome.json` must derive from the Phase 3 `record_code_review` response and include:

- reviewer agent;
- reviewed phases/files;
- finding and blocking counts;
- final review status;
- timestamp;
- review output hash;
- archive gate result.

Do not infer review from a final conversational summary.

### 7. Capture Validation Output Without Invented Counts

Run the actual repository commands and capture stdout/stderr plus exit codes. Store the complete textual output in `validation-output.txt` and parsed summaries in `manifest.json`.

The parser must tolerate Node test-runner output changes and preserve the raw output as source of truth. If a suite/case count cannot be parsed reliably, omit the count and report only exit status rather than guessing.

### 8. Define Production-Readiness Evidence

`production-readiness.json` is a criteria result, not a subjective label. For a static page, include:

- HTML validation status;
- accessibility status and tool/version;
- responsive viewport checks;
- browser console errors;
- broken link/asset checks;
- code-review status;
- unresolved blocking findings;
- scope caveats.

The report may use “production-ready” only when every required criterion is explicitly passed. Otherwise use a narrower phrase.

### 9. Add Evidence Verification Commands

Add package scripts such as:

```json
{
  "diagnostic:evidence:verify": "node dist/src/tooling/verify-diagnostic-evidence.js",
  "diagnostic:artifact-manifest": "node dist/src/tooling/diagnostics/artifact-manifest.js"
}
```

The verifier accepts an evidence directory and checks:

- schema validity;
- required file presence;
- hash integrity;
- source commit consistency;
- no unresolved redaction violations;
- no successful overall classification when delegation/protocol/review dimensions fail;
- no production-ready claim without all criteria passing;
- no report claim reference to absent evidence.

### 10. Add a Report-Evidence Reference Format

Use stable evidence references in the report, for example:

```text
Evidence: <run-id>/timeline.json#events[6]
Evidence: <run-id>/artifact-manifest.json#files[test-site/index.html]
```

The verifier must resolve references and fail on missing targets.

## Files to Add or Modify

Recommended additions:

- `src/tooling/diagnostics/evidence-schema.ts`
- `src/tooling/diagnostics/timeline-recorder.ts`
- `src/tooling/diagnostics/redaction.ts`
- `src/tooling/diagnostics/artifact-manifest.ts`
- `src/tooling/verify-diagnostic-evidence.ts`
- `docs/evidence/tui-eval/README.md`
- `tests/unit/diagnostic-evidence.test.js`
- `tests/unit/diagnostic-redaction.test.js`
- `package.json`

Modify `.gitignore` only if a narrowly scoped exemption is required. Do not unignore `docs/maestro/` or `/test-site/` broadly.

## Focused Test Plan

- valid complete evidence bundle passes;
- each required file missing independently fails;
- modified evidence file fails hash verification;
- secret-pattern fixture fails redaction validation;
- literal home path is sanitized;
- failed delegation plus overall success fails semantic validation;
- missing code review plus archived success fails semantic validation;
- production-ready claim with one failed criterion fails;
- unparseable test totals do not produce invented counts;
- relative, absolute, tilde-prefixed, missing, and content-variant plan paths are represented accurately in a path-behavior fixture.

## Validation Commands

```bash
npm run build
node --test tests/unit/diagnostic-evidence.test.js tests/unit/diagnostic-redaction.test.js
npm run diagnostic:evidence:verify -- docs/evidence/tui-eval/<fixture-run>
npm run typecheck
npm run check:source
```

## Deliverables

- Versioned diagnostic evidence schema.
- Timeline, redaction, and artifact-manifest helpers.
- Evidence verifier and package scripts.
- Tracked evidence-directory documentation.
- Semantic safeguards against contradictory success claims.
- Unit fixtures covering integrity and redaction.

## Exit Gate

Phase 4 is complete when:

- a third party can validate a fixture run without access to ignored runtime state;
- changed or missing evidence is detected;
- exact file sizes and hashes come from tooling;
- test totals are never guessed;
- delegation, review, and protocol outcomes cannot be collapsed into success by the verifier;
- no known secret or absolute home path survives redaction fixtures;
- the report-reference format resolves deterministically;
- focused tests and `check:source` pass.
