---
name: compliance-check
description: Run a Maestro-style regulatory compliance review for GDPR/CCPA, cookie consent, data handling, and licensing
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "delegation"].
Call `get_agent` with agents: ["compliance-reviewer"].

## Workflow

1. Identify applicable regulations and define audit scope
2. Review data handling patterns, user disclosures, consent flows, retention policies, and third-party integrations
3. Audit regulatory compliance: GDPR/CCPA, cookie consent, data residency, licensing, and open-source obligations
4. Present findings with regulatory reference, severity, compliance risk, and recommended actions
5. Distinguish legal-risk observations from code-level bugs
