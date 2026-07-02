# Codebase Grounding

Before narrowing an architecture or decomposing an implementation plan for work that touches an existing codebase, decide whether the task is already grounded.

Use the built-in `codebase_investigator` when any of the following are true:
- The request or plan targets an existing project or subsystem
- The current architecture, impacted modules, integration seams, or file ownership are unclear
- You need concrete validation commands, conventions, or ownership boundaries before presenting approaches or decomposing phases

Ask the investigator for:
- The current architecture slice relevant to the task, and the modules/files most likely to change
- Existing naming, layering, and testing conventions to preserve
- Integration points, dependency edges, and shared ownership hotspots
- Validation commands and test entry points already used by the repo
- Parallelization or file-conflict risks that should shape the design or implementation plan

Skip `codebase_investigator` for greenfield tasks, documentation-only work, or scopes that are already well understood from direct file reads in the current turn.
