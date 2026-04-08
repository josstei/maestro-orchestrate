---
name: maestro-debug
description: Run the Maestro debugging workflow for investigation-heavy tasks
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "delegation"].
Call `get_agent` with agents: ["debugger"].

## Workflow

1. Establish the failing behavior, repro path, and expected behavior
2. Form concrete hypotheses (2-3 likely root causes)
3. Gather evidence from code, logs, tests, and runtime behavior before proposing fixes
4. Isolate the most likely root cause and trace the execution path from trigger to failure
5. Verify the conclusion explains all symptoms and present the recommended fix with specific code location
