---
name: debug
description: Run the Maestro debugging workflow for investigation-heavy tasks
---


# Maestro Debug

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Establish the failing behavior, repro path, and expected behavior
2. Form concrete hypotheses (2-3 likely root causes)
3. Gather evidence from code, logs, tests, and runtime behavior before proposing fixes
4. Isolate the most likely root cause and trace the execution path from trigger to failure
5. Verify the conclusion explains all symptoms and present the recommended fix with specific code location

## Constraints

- Prefer evidence over speculation
- Make uncertainty explicit when the issue cannot be reproduced
- Return root cause, affected files, confidence level, and the smallest defensible next action
