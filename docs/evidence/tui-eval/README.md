# TUI Evaluation Diagnostic Evidence

This directory contains versioned, reproducible diagnostic evidence runs for the Maestro TUI Evaluation Diagnostic Program.

## Directory Structure

Each evidence run is stored in a subdirectory named `<run-id>`:

```text
docs/evidence/tui-eval/<run-id>/
├── manifest.json                  # Machine-readable run metadata and file SHA-256 inventory
├── environment.json               # Node/npm/OS runtime environment metadata
├── timeline.json                  # Monotonic event offsets and wall timestamps
├── mcp-calls.redacted.jsonl       # Redacted JSONL sequence of registered MCP tool calls
├── orchestration-outcome.json     # Lifecycle and protocol-compliance outcomes
├── artifact-manifest.json         # Relative paths, byte sizes, hashes, and MIME types
├── delegation-outcome.json        # Subagent tool dispatch and direct-write audit
├── code-review-outcome.json       # Findings, coverage, and review gate results
├── validation-output.txt          # Un-truncated test/build stdout/stderr output
├── production-readiness.json      # Objective criteria breakdown
└── run-summary.md                 # High-level summary of the diagnostic run
```

## Verification

To verify the integrity and semantic compliance of any evidence run:

```bash
npm run diagnostic:evidence:verify -- docs/evidence/tui-eval/<run-id>
```
