# Runtime Contract Tests

## Purpose

Each Maestro runtime adapter (`src/platforms/<runtime>/runtime-config.js`) declares a delegation contract — the tool name and parameters it expects the runtime CLI to expose. Without verification, a CLI version bump can silently invalidate these declarations, causing orchestrator dispatches to fail at runtime with confusing errors like `Tool "coder" not found`.

This contract test harness compares each runtime's declared contract against a captured fixture — the actual JSON request payload that runtime sent to its model. If the registered tool list, subagent registry shape, or delegation surface drifts, the test fails at `just ci` time.

## Components

| Component | Path | Purpose |
|-----------|------|---------|
| Fixtures | `tests/fixtures/runtime-contracts/<runtime>/request-payload.json` | Captured CLI request payloads, the ground-truth shape |
| Probes | `src/platforms/<runtime>/contract-probe.js` | Per-runtime parsers that produce a `RuntimeContract` |
| Verifier | `src/platforms/shared/contract-probes/verify-config.js` | Asserts `runtime-config.delegation.pattern` is achievable given the observed contract |
| Type | `src/platforms/shared/contract-probes/types.js` | Canonical `RuntimeContract` shape |
| Integration test | `tests/integration/runtime-contracts.test.js` | Loops all runtimes, verifies each runtime-config matches its fixture |

## Fixture refresh procedure

When a runtime CLI is upgraded:

1. Run `<runtime> --debug` (or equivalent capture mechanism) against a Maestro orchestration session in a clean test workspace
2. Save the first request payload to `tests/fixtures/runtime-contracts/<runtime>/request-payload.json`
3. Update the per-runtime `README.md` with the capture date and CLI version
4. Trim the fixture: `node tests/fixtures/runtime-contracts/_trim-fixture.js <src> <dst>` (the trim helper validates required keys before truncating)
5. Run `just test` — fix any contract drift surfaced by the test in this PR

Per-runtime capture procedures live in each `tests/fixtures/runtime-contracts/<runtime>/README.md`.

## Frontmatter enforcement

The contract reports `frontmatter_enforcement: 'enforced' | 'unverified' | 'unenforced'`. Maestro's per-agent `tools:`, `temperature:`, `max_turns:` frontmatter is governance metadata. If a runtime is `unverified`, Maestro's runtime-config must NOT set `delegation.requires_frontmatter_enforcement: true`. To upgrade a runtime to `enforced`, the maintainer must demonstrate (with a captured invocation log) that the runtime obeys the frontmatter at dispatch time.

## Verifier scope boundary

The verifier checks the **dispatch tool name** at the head of `delegation.pattern` only — it does NOT inspect templated parameter values inside the args block. For example:

- `Agent(subagent_type: "maestro:{{agent}}", prompt: "...")` — the leading `Agent` tool name is verified against `registered_tools`. The embedded `{{agent}}` template inside `subagent_type` is intentional: the orchestrator fills it at call time per-phase.
- `invoke_agent({agent_name: "<name>", prompt: "<prompt>"})` — same rule. `<name>` is a placeholder in the documentation, not an unresolved template at runtime.
- `{{agent}}(query: "...")` — REJECTED. An unresolved template at the tool-name position fails verification because `{{agent}}` is not a real registered tool. This was the rev-1 Gemini regression that PR #50 introduced.

## Per-runtime probe responsibilities

Each runtime's probe takes a captured payload and emits a `RuntimeContract`:

- **Gemini**: parses `tools[].functionDeclarations[].name` and the `<available_subagents>` block. Reports `frontmatter_enforcement: 'unverified'` until evidence of enforcement is captured.
- **Claude**: pending follow-up PR (`feat/claude-contract-probe`). Will parse the Anthropic API request envelope.
- **Codex**: pending follow-up PR (`feat/codex-contract-probe`). Will parse the Codex API request envelope.
- **Qwen**: pending follow-up PR (`feat/qwen-contract-probe`). Shares Gemini's payload format.

Stub probes throw `NotCapturedYetError` when a fixture is `{ "stub": true }`. The integration test calls `it.skip()` for stub fixtures so untested runtimes don't block CI but are clearly marked.

## Adding a new runtime

When Maestro adds a runtime adapter:

1. Capture a fixture per the refresh procedure above
2. Implement `src/platforms/<runtime>/contract-probe.js` (use the Gemini probe at `src/platforms/gemini/contract-probe.js` as reference)
3. Add the runtime to the `RUNTIMES` array in `tests/integration/runtime-contracts.test.js`
4. Run `just test` — the integration test will fail until `runtime-config.delegation.pattern` matches the captured contract
