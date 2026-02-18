---
name: code-review
description: Standalone code review methodology for structured, severity-classified code assessment
---

# Code Review Skill

Activate this skill when performing standalone code reviews via the `/maestro:review` command or during Phase 3 code quality gates. This skill provides the methodology for scoping, executing, and reporting code reviews.

## Scope Detection Protocol

Determine review scope using the following priority order:

1. **User-specified paths**: If the user provides file paths or glob patterns, expand glob patterns using the `glob` tool to resolve them to concrete file paths before delegating to the code-reviewer agent
2. **Staged changes**: If `git diff --staged` produces output, review staged changes
3. **Last commit diff**: If no staged changes exist, review the last commit via `git diff HEAD~1`
4. **Fallback**: If none of the above yield content, ask the user to specify scope

Always confirm the detected scope with the user before proceeding.

## Review Orchestration

### Delegation Flow

1. Detect review scope using the protocol above
2. Gather the full diff content for the detected scope
3. Delegate to the `code-reviewer` agent with:
   - The full diff content
   - File paths involved
   - Any user-provided focus areas or concerns
4. Process the agent's Task Report
5. Present findings to the user in the structured output format below

### Context Enrichment

When delegating to the code-reviewer agent, include:
- The diff content (not just file names)
- Surrounding context for modified sections (10 lines before/after when available)
- Project language and framework information (detected from package.json, Cargo.toml, go.mod, etc.)

## Severity Classification

### Critical
Issues that could cause security vulnerabilities, data loss, or system crashes:
- SQL/NoSQL injection vectors
- Authentication/authorization bypasses
- Unvalidated user input at system boundaries
- Resource leaks (unclosed connections, file handles)
- Race conditions with data corruption potential

### Major
Issues that cause bugs, design flaws, or significant maintainability problems:
- Logic errors in business rules
- Missing error handling on external calls
- SOLID principle violations that impact extensibility
- Incorrect API contracts or type mismatches
- Missing null/undefined checks on external data

### Minor
Issues related to style, naming, or minor convention violations:
- Naming inconsistencies
- Code style deviations from project conventions
- Suboptimal but correct implementations
- Missing type annotations where inference is insufficient

### Suggestion
Optional improvements that enhance readability or maintainability:
- Alternative patterns that improve clarity
- Performance optimizations with marginal impact
- Structural improvements for future extensibility

## Output Format

Present findings in a structured table followed by a summary:

```
## Code Review Results

**Scope**: [description of what was reviewed]
**Files Reviewed**: [count]
**Total Findings**: [count by severity]

### Findings

| # | Severity | File | Line | Description | Suggested Fix |
|---|----------|------|------|-------------|---------------|
| 1 | Critical | path/to/file.ts | 42 | [description] | [fix] |
| 2 | Major | path/to/file.ts | 87 | [description] | [fix] |

### Summary

[1-2 paragraph summary of overall code quality, patterns observed, and priority actions]
```

## Verification Rule

Every finding **must**:
- Reference a specific file and line number
- Be verified against the actual code (not assumed from patterns)
- Include a concrete suggested fix or action
- Be classified with a severity that matches the classification criteria above

Do NOT report:
- Speculative issues based on assumptions about runtime behavior
- Style preferences not established by the project's conventions
- Issues in code outside the review scope

## Review Scope Calibration

Calibrate the depth and focus of review based on the type of change being reviewed:

### Calibration Rules
- **New files**: Full review across all dimensions — architecture fit, pattern compliance, security, naming conventions, error handling, testability, dependency direction
- **Modified files (behavior change)**: Focus on the diff — correctness of new behavior, regression risk, contract compliance with existing interfaces, edge case handling in new code paths
- **Modified files (refactoring)**: Focus on behavior preservation — verify same inputs produce same outputs, no unintended side effects introduced, no behavior changes disguised as refactoring
- **Deleted files**: Dependency verification — confirm no remaining code imports from, references, or depends on the deleted files. Check for orphaned tests that tested the deleted code.
- **Configuration changes**: Environment impact assessment — does this change affect production? Staging? Local development? All environments? Are there secrets or credentials involved?

### Application
When reviewing a diff that contains multiple change types (new files + modifications + deletions), apply the appropriate calibration to each file independently. Do not apply "new file" depth to a file that only had a minor modification.

## Finding Deduplication Protocol

When reviewing multiple files, identify and consolidate findings that share the same root cause.

### Deduplication Rules
- If the same pattern violation appears in 3+ files, report it **once** as a systemic finding with the list of all affected locations — not as N separate findings
- A systemic finding includes: the pattern being violated, why it matters, the full list of affected file:line locations, and a single remediation recommendation that addresses all instances
- Unique findings (appearing in only 1-2 files) are reported individually as normal

### Deduplication Format
```
### Systemic Finding: [Pattern Violation Name]
- **Severity**: [Critical | Major | Minor | Suggestion]
- **Description**: [What the pattern violation is and why it matters]
- **Affected Locations**:
  - `path/to/file1.ext:line` — [brief context]
  - `path/to/file2.ext:line` — [brief context]
  - `path/to/file3.ext:line` — [brief context]
- **Remediation**: [Single recommendation that addresses all instances]
```

This produces cleaner, more actionable review output by surfacing systemic issues as patterns rather than repeating the same finding across multiple files.
