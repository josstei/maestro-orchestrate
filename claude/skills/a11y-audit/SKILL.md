---
name: maestro-a11y-audit
description: Run a Maestro-style accessibility audit for WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility
---


# Maestro Accessibility Audit

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Define the accessibility audit scope and target conformance level.
2. Identify UI components, pages, and interactive elements.
3. Audit WCAG compliance: ARIA usage, keyboard navigation, color contrast, screen reader compatibility.
4. Present findings with WCAG criterion, severity, location, and remediation code patterns.
5. Offer to apply remediations if approved.

## Constraints

- Present findings before proposing remediation.
- Do not modify code without explicit user approval.
