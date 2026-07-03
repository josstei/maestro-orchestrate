'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { defineAudit, AUDIT_PRESENTATION_CONSTRAINTS } = require('../../src/entry-points/archetypes/audit-archetype');

describe('AUDIT_PRESENTATION_CONSTRAINTS', () => {
  it('is the frozen shared presentation pair', () => {
    assert.deepEqual(AUDIT_PRESENTATION_CONSTRAINTS, [
      'Present findings before proposing remediation',
      'Do not modify code without explicit user approval',
    ]);
    assert.equal(Object.isFrozen(AUDIT_PRESENTATION_CONSTRAINTS), true);
  });
});

describe('defineAudit — defaults', () => {
  it('fills the shared skeleton and defaults', () => {
    const entry = defineAudit({
      name: 'x-audit',
      description: 'desc',
      agent: 'seo-specialist',
      workflow: ['a', 'b'],
    });
    assert.deepEqual(entry, {
      name: 'x-audit',
      description: 'desc',
      agents: ['seo-specialist'],
      skills: ['delegation'],
      refs: ['architecture'],
      workflow: ['a', 'b'],
      constraints: AUDIT_PRESENTATION_CONSTRAINTS,
    });
  });

  it('appends extra skills after delegation and omits runtimeNames when absent', () => {
    const entry = defineAudit({
      name: 'x', description: 'd', agent: 'a', workflow: ['w'], skills: ['code-review'],
    });
    assert.deepEqual(entry.skills, ['delegation', 'code-review']);
    assert.equal('runtimeNames' in entry, false);
  });

  it('includes runtimeNames when supplied', () => {
    const entry = defineAudit({
      name: 'x', runtimeNames: { claude: 'y' }, description: 'd', agent: 'a', workflow: ['w'],
    });
    assert.deepEqual(entry.runtimeNames, { claude: 'y' });
  });
});

describe('defineAudit — reproduces every current audit entry verbatim', () => {
  it('review', () => {
    assert.deepEqual(
      defineAudit({
        name: 'review',
        runtimeNames: { codex: 'review-code', claude: 'review-code' },
        description:
          'Perform a Maestro-style code review with findings ordered by severity and concrete file references',
        agent: 'code-reviewer',
        skills: ['code-review'],
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
      }),
      {
        name: 'review',
        runtimeNames: { codex: 'review-code', claude: 'review-code' },
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
      }
    );
  });

  it('security-audit', () => {
    assert.deepEqual(
      defineAudit({
        name: 'security-audit',
        description:
          'Run a Maestro-style security assessment for authentication, authorization, data exposure, secret handling, and exploitability risks',
        agent: 'security-engineer',
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
      }),
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
      }
    );
  });

  it('perf-check', () => {
    assert.deepEqual(
      defineAudit({
        name: 'perf-check',
        description:
          'Run a Maestro-style performance assessment for hotspots, regressions, and optimization planning',
        agent: 'performance-engineer',
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
      }),
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
      }
    );
  });

  it('seo-audit (pure — inherits default constraints)', () => {
    assert.deepEqual(
      defineAudit({
        name: 'seo-audit',
        description:
          'Run a Maestro-style SEO assessment for meta tags, structured data, crawlability, and Core Web Vitals',
        agent: 'seo-specialist',
        workflow: [
          'Define the SEO audit scope (page or site)',
          'Identify web-facing output files (HTML, templates, routes)',
          'Audit meta tags, schema markup, crawlability, canonicalization, internal linking, and Core Web Vitals',
          'Present findings with severity, SEO impact, location, and remediation guidance',
          'Note any checks that require live-site verification if the current environment cannot provide it',
        ],
      }),
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
      }
    );
  });

  it('a11y-audit (pure)', () => {
    assert.deepEqual(
      defineAudit({
        name: 'a11y-audit',
        description:
          'Run a Maestro-style accessibility audit for WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility',
        agent: 'accessibility-specialist',
        workflow: [
          'Define the accessibility audit scope and target conformance level (A, AA, AAA)',
          'Identify UI components, pages, and interactive elements',
          'Audit WCAG compliance: ARIA usage, keyboard navigation, focus management, color contrast, screen reader compatibility',
          'Present findings with WCAG criterion reference, severity, user impact, location, and remediation code patterns',
          'Note any manual verification gaps if the environment cannot exercise the UI directly',
        ],
      }),
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
      }
    );
  });

  it('compliance-check (pure)', () => {
    assert.deepEqual(
      defineAudit({
        name: 'compliance-check',
        description:
          'Run a Maestro-style regulatory compliance review for GDPR/CCPA, cookie consent, data handling, and licensing',
        agent: 'compliance-reviewer',
        workflow: [
          'Identify applicable regulations and define audit scope',
          'Review data handling patterns, user disclosures, consent flows, retention policies, and third-party integrations',
          'Audit regulatory compliance: GDPR/CCPA, cookie consent, data residency, licensing, and open-source obligations',
          'Present findings with regulatory reference, severity, compliance risk, and recommended actions',
          'Distinguish legal-risk observations from code-level bugs',
        ],
      }),
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
      }
    );
  });
});
