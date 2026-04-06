---
name: a11y-audit
description: Run a Maestro-style accessibility audit for WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility
---


# Maestro Accessibility Audit

Call `get_skill_content` with resources: ["architecture"].

## Protocol

Before delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.

## Workflow

1. Define the accessibility audit scope and target conformance level (A, AA, AAA)
2. Identify UI components, pages, and interactive elements
3. Audit WCAG compliance: ARIA usage, keyboard navigation, focus management, color contrast, screen reader compatibility
4. Present findings with WCAG criterion reference, severity, user impact, location, and remediation code patterns
5. Note any manual verification gaps if the environment cannot exercise the UI directly

## Constraints

- Present findings before proposing remediation
- Do not modify code without explicit user approval
