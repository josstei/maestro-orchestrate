---
title: "<topic> Implementation Plan"
design_ref: "<path to design document>"
created: "<ISO 8601 timestamp>"
status: "draft"
total_phases: <integer>
estimated_files: <integer>
---

# <Topic> Implementation Plan

## Plan Overview

- **Total phases**: [N]
- **Agents involved**: [list of agent names]
- **Estimated effort**: [summary of scope and complexity]

## Dependency Graph

```
[ASCII diagram showing phase dependencies and parallel opportunities]
```

## Execution Strategy

| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Foundation |

## Phase 1: <Phase Name>

### Objective
[Clear, measurable statement of what this phase delivers]

### Agent: <agent-name>
### Parallel: <Yes/No>

### Files to Create

- `path/to/file` — [Purpose, key interfaces/classes to define]

### Files to Modify

- `path/to/existing/file` — [What changes and why]

### Implementation Details

[Interface definitions, base class contracts, dependency injection patterns, error handling strategy]

### Validation

- [Commands to run and expected outcomes]

### Dependencies

- Blocked by: [Phase IDs or "None"]
- Blocks: [Phase IDs or "None"]

---

## File Inventory

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `path/to/file` | 1 | [Purpose] |

## Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1     | LOW/MEDIUM/HIGH | [Why this risk level — complexity, number of dependents, reversibility] |

## Execution Profile

```
Execution Profile:
- Total phases: [N]
- Parallelizable phases: [M] (in [B] batches)
- Sequential-only phases: [S]
- Estimated parallel wall time: [time estimate based on batch execution]
- Estimated sequential wall time: [time estimate based on serial execution]

Note: Parallel dispatch runs agents in autonomous mode (--approval-mode=yolo).
All tool calls are auto-approved without user confirmation.
```
