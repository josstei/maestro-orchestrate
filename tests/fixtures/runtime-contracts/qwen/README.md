# Qwen CLI Runtime Contract Fixture

**Captured:** [TBD — fill in when fixture is captured]
**Qwen CLI version:** [TBD]

## What this fixture is

The full request payload Qwen CLI sent to the model on the first turn of a Maestro orchestration session. Captures the registered tool list, the system instruction (including Maestro extension context), and the conversation history up to the moment of dispatch.

## What it proves

The contract test parses this fixture to assert:

1. Which tools are actually registered (compared to `runtime-config.tools`)
2. Whether the subagent registry exposes per-agent frontmatter fields
3. The dispatch surface available for delegation

If Qwen CLI changes its subagent registration shape, this fixture stops matching `runtime-config.delegation.pattern` and the test fails.

## How to refresh

When Qwen CLI is upgraded:

1. Run a Maestro orchestration session in a clean test workspace
2. Capture the first request payload to a JSON file
3. Replace this file
4. Update the `Captured` and `version` fields above
5. Run `just test` — fix any contract drift surfaced by the test

## File-size policy

Trim to the first turn only. Use `tests/fixtures/runtime-contracts/_trim-fixture.js`.
