---
name: security-audit
description: Run a Maestro-style security assessment for authentication, authorization, data exposure, secret handling, and exploitability risks
---


# Maestro Security Audit

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Define the audit scope.
2. Trace trust boundaries, auth flows, secret handling, and data exposure paths.
3. Identify concrete vulnerabilities or risky patterns.
4. Classify findings by severity and explain exploitability.
5. Provide remediation guidance with the highest-risk issues first.

## Constraints

- Prefer actionable findings over generic security advice.
- State clearly when the review is limited by unavailable runtime context.
