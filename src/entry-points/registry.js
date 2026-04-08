'use strict';

/**
 * Entry-point registry -- canonical workflow content for all 9 Maestro
 * entry points.  Each entry captures the shared intent, workflow steps,
 * and constraints extracted from the union of the Claude, Codex, and
 * Gemini runtime definitions.
 *
 * Content lives here once; format-specific rendering (TOML commands,
 * SKILL.md files) is handled by templates + the generator.
 */

module.exports = [
  {
    name: 'review',
    description:
      'Perform a Maestro-style code review with findings ordered by severity and concrete file references',
    agents: ['code-reviewer'],
    skills: ['delegation', 'code-review'],
    refs: ['architecture'],
    workflow: [
      'Determine review scope: explicit user-provided paths, staged changes, or last commit diff',
      'Delegate to the code-reviewer agent with the diff content and file paths',
      'Review for correctness, regressions, security, maintainability risk, and missing tests',
      'Classify findings by severity (Critical, Major, Minor, Suggestion) with concrete file and line references',
      'Present findings first, ordered by severity; keep the closing summary brief and only after findings',
    ],
    constraints: [
      'Do not bury findings behind a long overview',
      'Every finding must reference a specific file and line number -- no speculative issues',
      'If no findings exist, say so explicitly and note residual testing gaps',
    ],
  },

  {
    name: 'debug',
    description:
      'Run the Maestro debugging workflow for investigation-heavy tasks',
    agents: ['debugger'],
    skills: ['delegation'],
    refs: ['architecture'],
    workflow: [
      'Establish the failing behavior, repro path, and expected behavior',
      'Form concrete hypotheses (2-3 likely root causes)',
      'Gather evidence from code, logs, tests, and runtime behavior before proposing fixes',
      'Isolate the most likely root cause and trace the execution path from trigger to failure',
      'Verify the conclusion explains all symptoms and present the recommended fix with specific code location',
    ],
    constraints: [
      'Prefer evidence over speculation',
      'Make uncertainty explicit when the issue cannot be reproduced',
      'Return root cause, affected files, confidence level, and the smallest defensible next action',
    ],
  },

  {
    name: 'archive',
    description:
      'Archive the active Maestro session while preserving the shared state layout',
    agents: [],
    skills: ['session-management'],
    refs: ['architecture'],
    workflow: [
      'Check for an active session; if none exists, inform the user there is nothing to archive',
      'Present a brief summary of what will be archived (session ID, task, phase progress)',
      'Ask the user to confirm archival (the session may have incomplete phases)',
      'Move the active session file into the state archive directory',
      'Move the associated design and implementation plan files into the plans archive directory',
      'Verify that no active-session file remains and report the archived paths',
    ],
    constraints: [
      'Do not delete plan or session history',
      'Preserve the existing archive directory structure',
    ],
  },

  {
    name: 'status',
    description:
      'Summarize the active Maestro session without mutating state',
    agents: [],
    skills: ['session-management'],
    refs: ['architecture'],
    workflow: [
      'Read the active session using MCP state tools if available; otherwise fall back to scripts or direct file read',
      'Report session ID, creation timestamp, workflow mode, and overall status',
      'Show phase breakdown: completed phases with timestamps, current active phase, pending phases, and failed phases with error summaries',
      'Report file manifest (files created, modified, deleted), token usage by agent, and unresolved errors',
    ],
    constraints: [
      'This is read-only; do not mutate state, archive sessions, or continue execution',
      'If no active session exists, say so plainly',
    ],
  },

  {
    name: 'security-audit',
    description:
      'Run a Maestro-style security assessment for authentication, authorization, data exposure, secret handling, and exploitability risks',
    agents: ['security-engineer'],
    skills: ['delegation'],
    refs: ['architecture'],
    workflow: [
      'Define the audit scope from the user request and relevant code paths',
      'Trace trust boundaries, auth flows, secret handling, and data exposure paths',
      'Review for exploitable flaws, unsafe defaults, OWASP Top 10 vulnerabilities, and high-risk dependencies',
      'Classify findings by severity (CVSS-aligned) with file references and exploitability assessment',
      'Provide remediation guidance with the highest-risk issues first',
    ],
    constraints: [
      'Prefer actionable findings over generic security advice',
      'Present findings before proposing remediation',
      'State clearly when the review is limited by unavailable runtime context',
      'Do not modify code without explicit user approval',
    ],
  },

  {
    name: 'perf-check',
    description:
      'Run a Maestro-style performance assessment for hotspots, regressions, and optimization planning',
    agents: ['performance-engineer'],
    skills: ['delegation'],
    refs: ['architecture'],
    workflow: [
      'Define the performance target or pain point',
      'Establish the current baseline from available code, metrics, or reproducible commands',
      'Identify likely hotspots, structural bottlenecks, and hot loops through code analysis',
      'Prioritize fixes by expected impact versus implementation cost',
      'Report measurement gaps when hard evidence is unavailable and propose a validation plan',
    ],
    constraints: [
      'Avoid optimization advice that is disconnected from the observed bottleneck',
      'Distinguish measured issues from inferred ones',
    ],
  },

  {
    name: 'seo-audit',
    description:
      'Run a Maestro-style SEO assessment for meta tags, structured data, crawlability, and Core Web Vitals',
    agents: ['seo-specialist'],
    skills: ['delegation'],
    refs: ['architecture'],
    workflow: [
      'Define the SEO audit scope (page or site)',
      'Identify web-facing output files (HTML, templates, routes)',
      'Audit meta tags, schema markup, crawlability, canonicalization, internal linking, and Core Web Vitals',
      'Present findings with severity, SEO impact, location, and remediation guidance',
      'Note any checks that require live-site verification if the current environment cannot provide it',
    ],
    constraints: [
      'Present findings before proposing remediation',
      'Do not modify code without explicit user approval',
    ],
  },

  {
    name: 'a11y-audit',
    description:
      'Run a Maestro-style accessibility audit for WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility',
    agents: ['accessibility-specialist'],
    skills: ['delegation'],
    refs: ['architecture'],
    workflow: [
      'Define the accessibility audit scope and target conformance level (A, AA, AAA)',
      'Identify UI components, pages, and interactive elements',
      'Audit WCAG compliance: ARIA usage, keyboard navigation, focus management, color contrast, screen reader compatibility',
      'Present findings with WCAG criterion reference, severity, user impact, location, and remediation code patterns',
      'Note any manual verification gaps if the environment cannot exercise the UI directly',
    ],
    constraints: [
      'Present findings before proposing remediation',
      'Do not modify code without explicit user approval',
    ],
  },

  {
    name: 'compliance-check',
    description:
      'Run a Maestro-style regulatory compliance review for GDPR/CCPA, cookie consent, data handling, and licensing',
    agents: ['compliance-reviewer'],
    skills: ['delegation'],
    refs: ['architecture'],
    workflow: [
      'Identify applicable regulations and define audit scope',
      'Review data handling patterns, user disclosures, consent flows, retention policies, and third-party integrations',
      'Audit regulatory compliance: GDPR/CCPA, cookie consent, data residency, licensing, and open-source obligations',
      'Present findings with regulatory reference, severity, compliance risk, and recommended actions',
      'Distinguish legal-risk observations from code-level bugs',
    ],
    constraints: [
      'Present findings before proposing remediation',
      'Do not modify code without explicit user approval',
    ],
  },
];
