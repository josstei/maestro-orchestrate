# TUI Evaluation Diagnostic Evidence

This directory contains versioned, redacted evidence bundles for Maestro TUI evaluations. Evidence records must distinguish captured facts from assertions that cannot be independently recomputed because the underlying output was not retained.

## Schema v2 layout

```text
docs/evidence/tui-eval/<run-id>/
├── manifest.json
├── environment.json
├── timeline.json
├── mcp-calls.redacted.jsonl
├── agent-dispatches.redacted.jsonl
├── orchestration-outcome.json
├── artifact-manifest.json
├── delegation-outcome.json
├── code-review-outcome.json
├── validation-output.txt
├── production-readiness.json
└── run-summary.md
```

`agent-dispatches.redacted.jsonl` is distinct from MCP calls. `get_agent` retrieves methodology; it is not proof that the runtime executed a subagent. Successful delegation and review outcomes require correlated AGY dispatch records.

Artifact and response hashes whose source content was not retained are explicitly marked as recorded runtime values. They must not be described as independently recomputed.

Production readiness is false unless each required check identifies its tool and version and points to an inventoried raw output file.

## Verification

Run from any path inside the repository:

```bash
npm run diagnostic:evidence:verify -- docs/evidence/tui-eval/<run-id>
```

The verifier resolves the Git root with `git rev-parse`, checks that the evaluated commit is reachable from the declared branch, validates hashes and byte sizes, correlates MCP and agent-dispatch records, checks wall-clock timeline consistency, and verifies report and validation-output claims.
