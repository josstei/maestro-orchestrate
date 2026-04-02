---
description: Run the Maestro debugging workflow for investigation-heavy tasks
---


# Maestro Debug

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Reproduce or narrow the failure signal.
2. Form concrete hypotheses.
3. Gather evidence from code, logs, tests, and runtime behavior.
4. Isolate the most likely root cause.
5. Verify the conclusion and present the recommended fix or next step.

## Constraints

- Prefer evidence over speculation.
- Make uncertainty explicit when the issue cannot be reproduced.
