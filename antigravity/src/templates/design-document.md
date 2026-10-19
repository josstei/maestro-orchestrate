---
title: "<topic>"
created: "<ISO 8601 timestamp>"
status: "draft"
authors: ["TechLead", "User"]
type: "design"
design_depth: "standard" # one of: quick, standard, deep
task_complexity: "medium" # one of: simple, medium, complex
---

# <Topic> Design Document

## Problem Statement

[Clear description of the problem being solved, including context and motivation]

## Requirements

### Functional Requirements

1. **REQ-1**: [Requirement with measurable acceptance criteria]

### Non-Functional Requirements

1. **REQ-N**: [Performance, security, scalability, reliability requirements]

### Constraints

- [Technical, organizational, or business constraints]

## Approach

### Selected Approach

**[Approach Name]**

[Description of the selected approach and why it was chosen]

### Alternatives Considered

#### [Alternative 1 Name]

- **Description**: [Brief overview]
- **Pros**: [Key advantages]
- **Cons**: [Key disadvantages]
- **Rejected Because**: [Specific reason this was not selected]

### Decision Matrix

*(Standard and Deep modes only — omit in Quick mode)*

| Criterion | Weight | [Approach A] | [Approach B] |
|-----------|--------|--------------|--------------|
| [Criterion from requirements] | [%] | [1-5]: [justification] | [1-5]: [justification] |
| **Weighted Total** | | [score] | [score] |

## Architecture

<!-- Standard+Deep: Include rationale annotations on key decisions.
     Format: [decision] — *[rationale referencing constraints or user-stated preferences]*
     Deep only: Include per-decision alternatives considered.
     Format: [decision] *(considered: [alt A] — rejected because [reason]; [alt B] — rejected because [reason])*
     Deep only: Tag decisions with Traces To: REQ-N -->

### Component Diagram

```
[ASCII or text-based component diagram showing key components and their relationships]
```

### Data Flow

[Description of how data flows through the system, including inputs, transformations, and outputs]

### Key Interfaces

```
[Interface definitions with type signatures for the primary contracts between components]
```

## Agent Team

| Phase | Agent(s) | Parallel | Deliverables |
|-------|----------|----------|--------------|
| 1     | [agent]  | No       | [deliverable] |

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| [risk] | HIGH/MEDIUM/LOW | HIGH/MEDIUM/LOW | [mitigation strategy] |

## Success Criteria

1. [Measurable criterion that indicates successful completion]
