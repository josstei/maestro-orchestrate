# Maestro AGY TUI Orchestration Evaluation and Remediation Report

## Document Metadata

- **Repository**: `josstei/maestro-orchestrate`
- **Branch**: `refactor/codebase_normalization_reduction`
- **Evaluated Commit**: `87598736fd0e638db89168a70a96c36553ce4ba7`
- **Runtime**: AGY TUI; the AGY CLI build/version was not retained by the evaluation capture
- **Maestro Version**: `1.6.4`
- **Model Display Name**: Gemini 3.6 Flash; an exact provider model ID was not retained
- **Evaluation Date**: 2026-08-07
- **Evidence Bundle**: [`docs/evidence/tui-eval/2026-08-07T054800Z-8759873/`](evidence/tui-eval/2026-08-07T054800Z-8759873/)
- **Report Status**: Evidence-backed AGY end-to-end orchestration smoke test

## Executive Summary

A genuine Maestro orchestration was executed through the AGY TUI using Gemini 3.6 Flash against the frozen commit `87598736fd0e638db89168a70a96c36553ce4ba7`. The evaluated task created a static Nova Analytics landing page with vanilla HTML and CSS.

The run completed the expected Maestro control-plane lifecycle, dispatched separate implementation and review subagents through AGY, recorded a passing mandatory review, and archived the session without parent-orchestrator implementation fallback. The evidence bundle records the Git binding, MCP calls, AGY dispatch metadata, wall-clock timeline, artifact metadata, review outcome, and local validation output.

This is an **orchestration and lifecycle smoke test**. It is not a production-readiness certification. HTML validation, browser testing, accessibility scanning, responsive viewport testing, console inspection, and broken-link testing were not retained as independently verifiable outputs and are therefore marked `not_assessed`.

## Evaluation Result

| Dimension | Result | Evidence |
| --- | --- | --- |
| Frozen implementation commit | Pass | [`manifest.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/manifest.json) |
| Runtime and model capture | AGY / Gemini 3.6 Flash | [`manifest.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/manifest.json) |
| MCP lifecycle | Pass | [`mcp-calls.redacted.jsonl`](evidence/tui-eval/2026-08-07T054800Z-8759873/mcp-calls.redacted.jsonl) |
| Coder dispatch | Pass | [`agent-dispatches.redacted.jsonl`](evidence/tui-eval/2026-08-07T054800Z-8759873/agent-dispatches.redacted.jsonl) |
| Parent direct implementation | Not observed | [`delegation-outcome.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/delegation-outcome.json) |
| Mandatory review | Pass; zero blocking findings | [`code-review-outcome.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/code-review-outcome.json) |
| Session archival | Pass | [`orchestration-outcome.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/orchestration-outcome.json) |
| Local test suite at evaluated commit | 1,781 passing tests across 329 suites | [`validation-output.txt`](evidence/tui-eval/2026-08-07T054800Z-8759873/validation-output.txt) |
| Source and release gates at evaluated commit | Pass | [`validation-output.txt`](evidence/tui-eval/2026-08-07T054800Z-8759873/validation-output.txt) |
| Production readiness | Not assessed | [`production-readiness.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/production-readiness.json) |

## Run Timeline

The timeline uses actual wall-clock offsets from the manifest start time. MCP operation durations and agent-execution windows are represented separately.

| Stage | Approximate Window | Result | Evidence |
| --- | ---: | --- | --- |
| Workspace initialization and settings | 2–4 seconds | Pass | `timeline.json`, calls 1–2 |
| Session status and task classification | 5–6 seconds | Pass | `timeline.json`, calls 3–4 |
| Session creation and agent methodology load | 7–8 seconds | Pass | `timeline.json`, calls 5–6 |
| AGY coder dispatch | 8.1–43 seconds | Pass | `dispatch-coder-1` |
| Phase transition | At 43 seconds | Pass | call 7 |
| AGY code-reviewer dispatch | 47–51 seconds | Pass | `dispatch-reviewer-1` |
| Review recording and archival | 51–52 seconds | Pass | calls 8–9 |
| Total captured wall-clock window | 53 seconds | Pass | `manifest.json` |

## Captured Outputs

### Generated artifacts

The hashes below were recorded by the AGY evaluation capture. The generated files were intentionally not committed to the source branch, so their content is not independently re-hashable from this repository checkout.

- `test-site/index.html`: 22,541 bytes; SHA-256 `11a84821b3d6152297817d122fc2586c95432a2dd307f828d41d965d1084a847`
- `test-site/styles.css`: 17,322 bytes; SHA-256 `3c5a83de7263f338390ad955ead1203ef8cd37ee3a41a99dff343fa5ca3f6a90`
- `docs/maestro/state/archive/2026-08-07-nova-analytics-landing-page.md`: 2,532 bytes; SHA-256 `4d3a8074b14de4c58eed0bbad0cd5f4b8c2780f90b1154d60a4ef98337cfdebc`

See [`artifact-manifest.json`](evidence/tui-eval/2026-08-07T054800Z-8759873/artifact-manifest.json).

### Agent-response provenance

The AGY capture retained response digests but not raw or redacted response bodies. These digests establish correlation within the capture; they are not independently recalculable from the repository.

- Coder response SHA-256: `2fe9fffba10b5bbbb65049f6c28e37e52d2a3b897e071b06e6f231d0ded30940`
- Code-reviewer response SHA-256: `cdc8442699491ba72b20c469095b5c717cab45a9f065b6ca33f4581a184db086`

See [`agent-dispatches.redacted.jsonl`](evidence/tui-eval/2026-08-07T054800Z-8759873/agent-dispatches.redacted.jsonl).

## Remediation End State

The branch now implements the following controls. The AGY run proves the orchestration path at the frozen evaluated commit; review-freshness and verifier hardening added after that run are source-level remediations covered by regression tests rather than claims derived from the run itself.

1. Canonical and compatibility agent inputs normalize to one internal representation while rejecting missing, empty, ambiguous, and invalid-cardinality payloads.
2. Failed subagent execution is recorded as a failed phase rather than being silently replaced by parent implementation.
3. Non-documentation changes require an explicitly recorded passing review before archival.
4. Reviewer identities are restricted to authorized review agents.
5. A later non-documentation phase invalidates any prior passing review, including a modification to a previously reviewed path.
6. Executable and code files beneath documentation-oriented directories are conservatively treated as implementation changes.
7. Diagnostic evidence verification resolves the real Git root, verifies commit existence and branch reachability, correlates MCP calls and AGY dispatches, validates timestamp offsets, and rejects unsupported production-readiness claims.
8. Artifact manifest generation uses argument-safe Git invocation and path-containment checks.

## Original Audit Findings

| ID | Finding | Final disposition |
| --- | --- | --- |
| F-01 | Incorrect overall success classification | Closed: outcomes are separated by artifact, delegation, review, protocol, and archival status. |
| F-02 | Parent direct-write fallback treated as recovery | Closed: prohibited by orchestration instructions and failure-state handling. |
| F-03 | Mandatory review not demonstrated before archive | Closed: server-enforced review gate and recorded AGY reviewer dispatch. |
| F-04 | SDK boundary and service validation conflated | Closed: documentation and tests distinguish the validation layers. |
| F-05 | Design-gate mismatch described too broadly | Closed: wording and tests reflect approved foreign-session gates only. |
| F-06 | Relative plan paths described as categorically failing | Closed: supported and failing path variants are tested separately. |
| F-07 | Unsupported model-behavior frequency claims | Closed: frequency language was removed unless evidence-backed. |
| F-08 | Unsafe permissive `get_agent` compatibility proposal | Closed: bounded normalization and exclusivity validation implemented. |
| F-09 | Undefined multi-agent phase compatibility semantics | Closed: compatibility arrays require exactly one agent. |
| F-10 | Timings, sizes, and tests asserted without evidence | Closed: claims are linked to versioned evidence and unsupported provenance is explicitly qualified. |
| F-11 | Unsupported production-ready claim | Closed: production readiness is explicitly `not_assessed`. |

## Evidence Limitations

- The AGY CLI version and exact provider model ID were not retained by the runtime capture.
- Raw coder and reviewer responses were not retained; their hashes are provenance-only.
- Generated page and archived state contents were not committed; their hashes are capture records rather than repository-recalculable artifacts.
- The evaluation establishes orchestration behavior, not visual or production quality.
