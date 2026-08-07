# Phase 6 — Fresh Run, Authoritative Report, and Program Closeout

## Objective

Execute a fresh TUI orchestration against the fully remediated branch, capture a complete evidence bundle, update the diagnostic report from provisional to authoritative, and prove closure of every audit finding.

Phase 6 does not implement deferred code. All code, contract, protocol, tooling, and regression work must already be complete.

## Preconditions

- Phases 1–5 exit gates are satisfied.
- Target branch is clean and points to a known commit.
- `npm run check:source` passes.
- `npm run check:release` passes.
- Evidence tooling is built and tested.
- Runtime under test is installed and version-identifiable.
- No stale active session or approved design gate can contaminate the run; cleanup state is captured rather than silently performed.

## Implementation Tasks

### 1. Freeze the Evaluation Commit

Record:

- full branch name;
- full commit SHA;
- tree SHA;
- package version;
- clean/dirty state;
- generated-surface verification result.

The evidence manifest must bind every file to this commit. If the run requires a code change, stop, return to the responsible earlier phase, fix and revalidate, then freeze a new commit. Do not run against a moving branch and later attach evidence to another SHA.

### 2. Prepare a Controlled Workspace

Capture pre-run state:

- workspace path in redacted form;
- resolved `MAESTRO_STATE_DIR`;
- existing active session status;
- existing design-gate inventory;
- runtime configuration and relevant non-secret settings;
- tool inventory including exact `get_agent`, `create_session`, `record_code_review`, and `archive_session` names.

If cleanup is needed, record each removed state artifact and reason in the evidence bundle. Do not describe cleanup as reproducing or proving an error condition.

### 3. Execute the Fresh TUI Scenario

Use a deterministic, documented static-page task comparable to the Nova Analytics scenario. Record all user choices and approvals in redacted/structured form.

The successful path must demonstrate:

1. workspace initialization;
2. settings resolution;
3. no conflicting active session;
4. simple-task Express classification;
5. structured brief and approval;
6. session creation with canonical phase input;
7. `get_agent` retrieval through the registered tool;
8. implementation delegated to the assigned agent;
9. complete Task Report and downstream context;
10. phase transition with accurate file manifests;
11. code-review delegation;
12. `record_code_review` with zero blocking findings or a documented remediation/re-review cycle;
13. archive after the server confirms the review gate;
14. final outcome reported across separate dimensions.

Do not permit parent direct implementation. If delegation fails, capture the failure path and stop or remediate according to Phase 3; do not convert that run into the authoritative successful specimen.

### 4. Execute Targeted Negative Scenarios

Capture smaller evidence runs or automated fixtures for:

- `get_agent` missing/both/empty inputs;
- plan phase with multiple agents;
- approved design gate for another session ID;
- current unapproved design gate;
- literal tilde implementation-plan path;
- missing relative implementation-plan path;
- archive before review;
- blocked review;
- failed agent dispatch.

These can be automated integration evidence rather than manual TUI sessions, but each report claim must point to an appropriate record.

### 5. Run Production-Readiness Criteria

Only when the report intends to use “production-ready,” execute and capture every criterion defined in Phase 4. Otherwise explicitly scope the claim to “complete static implementation” and record the unexecuted criteria as not assessed.

No subjective visual statement should be promoted to fact without a documented rubric and result.

### 6. Run Full Validation at the Frozen Commit

Execute and capture:

```bash
npm run typecheck
npm run typecheck:type-tests
npm test
npm run check:source
npm run check:release
npm run diagnostic:evidence:verify -- docs/evidence/tui-eval/<run-id>
```

Record raw output and exit codes. Generate exact test totals only from the captured parser result. Do not copy historical totals from the baseline report.

### 7. Publish the Evidence Bundle

Commit the redacted evidence directory under:

- `docs/evidence/tui-eval/<run-id>/`

Ensure:

- all hashes verify;
- no secret scanner/redaction test fails;
- ignored generated assets are represented by manifests and hashes;
- report evidence references resolve;
- runtime output and source commit match.

### 8. Rewrite the Diagnostic Report as Authoritative

Update `docs/diagnostic-report-tui-eval.md`:

- status becomes `authoritative / evidence-backed`;
- baseline run and remediated run are clearly separated;
- corrected source semantics remain unchanged;
- each runtime claim cites an evidence reference;
- exact model/version uses captured runtime output;
- timings use timeline data;
- artifact sizes/hashes use the artifact manifest;
- test results use captured validation output;
- delegation and review outcomes are explicit;
- overall result is derived from outcome dimensions;
- unsupported frequency or quality claims are removed;
- recommendations are marked implemented, rejected with rationale, or retained as future enhancements.

Include a before/after table for every F-01 through F-11 finding.

### 9. Update Public/Internal Documentation

Update as applicable:

- `docs/runtime-payload-contract.md`
- `docs/usage.md`
- `docs/flow.md`
- `docs/architecture.md`
- `CHANGELOG.md`

Document:

- canonical and compatibility payloads;
- single-agent phase cardinality;
- structured errors;
- review archive gate;
- evidence tooling and commands;
- migration/compatibility notes for existing callers;
- legacy session behavior.

Do not duplicate generated-source documentation in generated outputs; change canonical sources and regenerate.

### 10. Produce a Closure Matrix

Add to the report or a closeout appendix:

| Finding | Code Change | Test | Evidence | Final Status |
| --- | --- | --- | --- | --- |
| F-01 through F-11 | path/commit | test name | evidence reference | closed |

No finding can be closed with documentation alone when the program assigned runtime or test work to it.

### 11. Final Branch Integrity Check

From a clean checkout:

1. regenerate outputs;
2. verify no diff;
3. verify all committed evidence hashes;
4. verify all report references;
5. compare final branch to baseline commit;
6. inspect that only intended source, tests, docs, and evidence changed;
7. confirm no ignored runtime state was accidentally force-added;
8. confirm branch tip contains the plan, implementation, evidence, and final report.

## Deliverables

- Frozen evaluation commit metadata.
- Fresh successful TUI evidence bundle.
- Negative-path evidence fixtures.
- Full validation evidence.
- Authoritative corrected diagnostic report.
- Updated architecture/usage/flow/payload/change documentation.
- F-01 through F-11 closure matrix.

## Final Acceptance Criteria

The remediation program is complete when:

- the assigned implementation agent, not the parent orchestrator, creates the authoritative run’s implementation;
- phase transition records accurate manifests and downstream context;
- mandatory code review is recorded and archive occurs only after pass;
- all compatibility input rules are demonstrated by tests;
- design-gate and path behavior match code, tests, and report wording;
- exact timings, file sizes, model identity, and tests are linked to evidence;
- “production-ready” is either objectively proven or absent;
- every evidence hash and report reference verifies;
- all repository validation gates pass from a clean checkout;
- every F-01 through F-11 row is closed with code/test/evidence as required;
- no known issue of any criticality is carried beyond this phase.
