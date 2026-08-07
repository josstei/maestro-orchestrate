# TUI Diagnostic Remediation Implementation Program

## Baseline

- Repository: `josstei/maestro-orchestrate`
- Target branch: `refactor/codebase_normalization_reduction`
- Baseline commit: `d67aab4e7eb272b32db9be64cfdc466663dc0280`
- Baseline report: `docs/diagnostic-report-tui-eval.md`
- Audit disposition: request changes

This program converts the audit findings against the baseline report into a complete implementation path. It covers documentation accuracy, MCP input contracts, orchestration protocol integrity, diagnostic evidence, regression testing, and final report publication. All findings are included regardless of severity.

## Required End State

The work is complete only when all of the following are true:

1. The diagnostic report distinguishes artifact success, state-lifecycle success, delegation success, protocol compliance, and review completion instead of collapsing them into a single success label.
2. Every factual claim in the report is either code-grounded, runtime-evidenced, or explicitly marked unverified.
3. `get_agent` has one canonical internal input representation and a deliberately bounded compatibility surface.
4. `create_session` accepts only unambiguous single-agent phase assignments and normalizes compatibility input before canonical validation.
5. Invalid, empty, conflicting, or multi-agent compatibility payloads fail with stable structured errors.
6. Direct parent-orchestrator implementation is not treated as a successful recovery from agent delegation failure.
7. Sessions with non-documentation changes cannot archive until the required code review is recorded as passed.
8. Diagnostic runs produce a redacted, reproducible evidence bundle containing environment, timeline, calls, artifact hashes, validation output, delegation outcome, and review outcome.
9. Test counts, timings, model identifiers, file sizes, and quality claims are generated from evidence rather than manually asserted.
10. All source and generated runtime surfaces remain synchronized and pass repository source, test, and release verification.
11. A fresh TUI run demonstrates the corrected behavior and becomes the evidence source for the authoritative report.

## Phase Sequence

| Phase | Plan | Primary Outcome | Depends On |
| --- | --- | --- | --- |
| 1 | [Report Correction and Baseline](./phase-01-report-correction-and-baseline.md) | The existing report is accurate, qualified, and safe to use as the remediation baseline. | None |
| 2 | [Input Contract Normalization](./phase-02-input-contract-normalization.md) | `get_agent` and `create_session` accept bounded compatibility forms while preserving canonical internals. | Phase 1 |
| 3 | [Orchestration Integrity and Review Gates](./phase-03-orchestration-integrity-and-review-gates.md) | Delegation failures cannot be mislabeled as successful orchestration, and review is enforced before archive. | Phase 2 |
| 4 | [Diagnostic Evidence and Reproducibility](./phase-04-diagnostic-evidence-and-reproducibility.md) | Every runtime claim can be traced to a committed evidence record. | Phase 3 |
| 5 | [Regression and Multi-Runtime Verification](./phase-05-regression-and-multi-runtime-verification.md) | Contract, protocol, evidence, generated-output, and runtime-bundle behavior are fully tested. | Phase 4 |
| 6 | [Closeout and Authoritative Report](./phase-06-closeout-and-authoritative-report.md) | A fresh verified run replaces provisional claims and closes every audit finding. | Phase 5 |

Phases are intentionally sequential. A phase must satisfy its exit gate before the next phase begins. Work discovered within a phase must be completed in that phase unless it changes an explicitly documented architectural decision; it must not be silently carried forward.

## Audit Finding Traceability

| ID | Finding | Resolution Phase |
| --- | --- | --- |
| F-01 | The run was labeled a complete success despite failed/degraded agent execution. | 1, 3, 6 |
| F-02 | Parent-orchestrator direct file creation was treated as a valid recovery path. | 1, 3 |
| F-03 | Mandatory code-review execution was not demonstrated before archive. | 1, 3, 5, 6 |
| F-04 | The report did not distinguish SDK/Zod boundary rejection from service-level `validatePhases` rejection. | 1, 2, 5 |
| F-05 | `DESIGN_GATE_SESSION_MISMATCH` was described too broadly; only approved gates for other session IDs participate. | 1, 5 |
| F-06 | Relative implementation-plan paths were incorrectly described as inherently failing. | 1, 4, 5 |
| F-07 | `get_agent` canonical schema and exact tool naming were identified, but occurrence-frequency claims were unsupported. | 1, 2, 4 |
| F-08 | The proposed `get_agent` remediation allowed empty and conflicting payloads. | 2, 5 |
| F-09 | The proposed `create_session` remediation did not define single-agent cardinality or conflict behavior. | 2, 5 |
| F-10 | Generated assets, timings, model, state archive, and exact test totals were not independently evidenced. | 1, 4, 5, 6 |
| F-11 | “Production-ready” and “high-quality” claims lacked objective acceptance evidence. | 1, 4, 6 |

## Global Engineering Rules

### Canonical Versus Compatibility Input

- Canonical inputs are the only shapes used by handlers, services, state schemas, and persisted state.
- Compatibility aliases are accepted only at the external MCP boundary.
- Normalization occurs once, before domain validation.
- Both canonical and alias fields in the same payload are rejected, even when values match.
- Empty strings, empty arrays, non-string values, and unsupported cardinality are rejected.
- Compatibility must not introduce new semantics. In particular, an `agents` array on a plan phase may contain exactly one entry; multiple entries do not create implicit multi-agent phases.

### Evidence Classification

Every report statement must use one of these classifications:

- `code-grounded`: proven by source at the evaluated commit.
- `runtime-evidenced`: supported by a captured run artifact.
- `inferred`: a clearly labeled conclusion from code or evidence.
- `unverified`: plausible but not supported by the committed evidence set.

### Generated Surfaces

`src/` remains the source of truth. Any change affecting generated runtime bundles must be followed by repository generation and drift verification. Generated files must not be edited directly.

### Validation Standard

At minimum, the final implementation must pass:

```bash
npm run typecheck
npm run typecheck:type-tests
npm test
npm run check:source
npm run check:release
```

The execution agent must also run focused tests during each phase rather than waiting until Phase 5.

## Program Completion Gate

The program is complete only when:

- Every F-01 through F-11 row has committed implementation and test evidence.
- The final branch comparison contains no unexplained generated drift.
- The latest evidence verifier reports no missing required artifacts and no report claim without a supporting evidence reference.
- A fresh Express TUI orchestration delegates implementation to the registered agent, records transition data, performs code review, and archives only after review passes.
- The updated report no longer uses unsupported categorical language.
- `npm run check:source` and `npm run check:release` pass from a clean checkout of the branch.
