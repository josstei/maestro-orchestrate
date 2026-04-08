---
name: archive
description: Archive the active Maestro session while preserving the shared state layout
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "session-management"].

## Workflow

1. Check for an active session; if none exists, inform the user there is nothing to archive
2. Present a brief summary of what will be archived (session ID, task, phase progress)
3. Ask the user to confirm archival (the session may have incomplete phases)
4. Move the active session file into the state archive directory
5. Move the associated design and implementation plan files into the plans archive directory
6. Verify that no active-session file remains and report the archived paths
