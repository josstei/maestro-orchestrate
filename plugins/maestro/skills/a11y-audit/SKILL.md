---
name: a11y-audit
description: Run a Maestro-style accessibility audit for WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "delegation"].
Call `get_agent` with agents: ["accessibility-specialist"].

## Workflow

1. Define the accessibility audit scope and target conformance level (A, AA, AAA)
2. Identify UI components, pages, and interactive elements
3. Audit WCAG compliance: ARIA usage, keyboard navigation, focus management, color contrast, screen reader compatibility
4. Present findings with WCAG criterion reference, severity, user impact, location, and remediation code patterns
5. Note any manual verification gaps if the environment cannot exercise the UI directly
