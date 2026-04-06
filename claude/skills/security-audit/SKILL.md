---
name: security-audit
description: Run a Maestro-style security assessment for authentication, authorization, data exposure, secret handling, and exploitability risks
---


# Maestro Security Audit

Call `get_skill_content` with resources: ["architecture"].

## Protocol

Before delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.

## Workflow

1. Define the audit scope from the user request and relevant code paths
2. Trace trust boundaries, auth flows, secret handling, and data exposure paths
3. Review for exploitable flaws, unsafe defaults, OWASP Top 10 vulnerabilities, and high-risk dependencies
4. Classify findings by severity (CVSS-aligned) with file references and exploitability assessment
5. Provide remediation guidance with the highest-risk issues first

## Constraints

- Prefer actionable findings over generic security advice
- Present findings before proposing remediation
- State clearly when the review is limited by unavailable runtime context
- Do not modify code without explicit user approval
