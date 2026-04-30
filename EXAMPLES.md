# Maestro Examples

This guide is a scenario catalog for Maestro public entry points across Gemini CLI, Claude Code, Codex, and Qwen Code. Use the command form for the runtime you are running.

Canonical sources for this page:

- Command names and runtime remapping: `src/entry-points/core-command-registry.js`, `src/entry-points/registry.js`, and `src/generator/entry-point-expander.js`
- Orchestration behavior: `src/references/orchestration-steps.md` and `docs/flow.md`
- Quick-start task wording: `README.md`
- Standalone entry-point behavior: `src/entry-points/registry.js`
- Contributor commands: `package.json`, `justfile`, and `docs/usage.md`

## Runtime Command Forms

| Capability | Gemini CLI | Claude Code | Codex | Qwen Code |
|------------|------------|-------------|-------|-----------|
| Full orchestration | `/maestro:orchestrate` | `/orchestrate` | `$maestro:orchestrate` | `/maestro:orchestrate` |
| Execute plan | `/maestro:execute` | `/execute` | `$maestro:execute` | `/maestro:execute` |
| Session status | `/maestro:status` | `/status` | `$maestro:status` | `/maestro:status` |
| Resume session | `/maestro:resume` | `/resume-session` | `$maestro:resume-session` | `/maestro:resume` |
| Archive session | `/maestro:archive` | `/archive` | `$maestro:archive` | `/maestro:archive` |
| Code review | `/maestro:review` | `/review-code` | `$maestro:review-code` | `/maestro:review` |
| Debug workflow | `/maestro:debug` | `/debug-workflow` | `$maestro:debug-workflow` | `/maestro:debug` |
| Security audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` | `/maestro:security-audit` |
| Performance check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` | `/maestro:perf-check` |
| Accessibility audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` | `/maestro:a11y-audit` |
| SEO audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` | `/maestro:seo-audit` |
| Compliance check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` | `/maestro:compliance-check` |

Claude Code and Codex reserve `/review`, `/debug`, and `/resume` for host behavior. Maestro remaps those public entry points to `review-code`, `debug-workflow`, and `resume-session` in those runtimes.

## Full Feature Orchestration

Use this when the task needs design, planning, specialist execution, and final review.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:orchestrate Build a REST API for a task management system with user authentication` |
| Claude Code | `/orchestrate Build a REST API for a task management system with user authentication` |
| Codex | `$maestro:orchestrate Build a REST API for a task management system with user authentication` |
| Qwen Code | `/maestro:orchestrate Build a REST API for a task management system with user authentication` |

Expected outcome: Maestro classifies the task, routes simple work to Express or medium/complex work to the Standard workflow, produces an approved implementation plan for Standard work, delegates execution to specialists, runs the completion review gate, and archives when `MAESTRO_AUTO_ARCHIVE` is true or unset.

Source: `README.md`, `src/entry-points/core-command-registry.js`, `src/references/orchestration-steps.md`, `docs/flow.md`

## Execute an Approved Plan

Use this when an approved implementation plan already exists and you want Maestro to run it.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:execute docs/maestro/plans/2024-03-15-auth-system-impl-plan.md` |
| Claude Code | `/execute docs/maestro/plans/2024-03-15-auth-system-impl-plan.md` |
| Codex | `$maestro:execute docs/maestro/plans/2024-03-15-auth-system-impl-plan.md` |
| Qwen Code | `/maestro:execute docs/maestro/plans/2024-03-15-auth-system-impl-plan.md` |

Expected outcome: Maestro reads the approved plan, resolves the execution mode gate, creates or resumes session state, then executes phases through child agents following the loaded methodology.

Source: `src/entry-points/core-command-registry.js`, `src/skills/shared/execution/SKILL.md`, `docs/usage.md`

## Check Session Status

Use this to inspect the active session without mutating state.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:status` |
| Claude Code | `/status` |
| Codex | `$maestro:status` |
| Qwen Code | `/maestro:status` |

Expected outcome: Maestro reports the session ID, creation timestamp, workflow mode, overall status, phase breakdown, file manifest, token usage by agent, and unresolved errors.

Source: `src/entry-points/registry.js`

## Resume an Interrupted Session

Use this after a prior orchestration was paused, interrupted, or left with pending phases.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:resume Continue from the first pending or failed phase` |
| Claude Code | `/resume-session Continue from the first pending or failed phase` |
| Codex | `$maestro:resume-session Continue from the first pending or failed phase` |
| Qwen Code | `/maestro:resume Continue from the first pending or failed phase` |

Expected outcome: Maestro reads the active session state, summarizes completed and pending phases, then resumes from the first pending or failed phase following the loaded methodology.

Source: `src/entry-points/core-command-registry.js`, `docs/flow.md`

## Archive a Session

Use this when the active session should be moved out of the active state directory.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:archive` |
| Claude Code | `/archive` |
| Codex | `$maestro:archive` |
| Qwen Code | `/maestro:archive` |

Expected outcome: Maestro summarizes the active session, asks the user to confirm archival, moves the active session and associated plan files into archive directories, and verifies that no active session remains.

Source: `src/entry-points/registry.js`

## Standalone Code Review

Use this when you want findings ordered by severity without running the full orchestration workflow.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:review Review the staged changes for correctness, regressions, security, maintainability risk, and missing tests` |
| Claude Code | `/review-code Review the staged changes for correctness, regressions, security, maintainability risk, and missing tests` |
| Codex | `$maestro:review-code Review the staged changes for correctness, regressions, security, maintainability risk, and missing tests` |
| Qwen Code | `/maestro:review Review the staged changes for correctness, regressions, security, maintainability risk, and missing tests` |

Expected outcome: Maestro delegates to the code-reviewer agent, classifies findings by Critical, Major, Minor, and Suggestion, and presents findings first with concrete file and line references.

Source: `src/entry-points/registry.js`

## Standalone Debugging

Use this for investigation-heavy work where the root cause is not yet known.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:debug Investigate the failing behavior, repro path, and expected behavior` |
| Claude Code | `/debug-workflow Investigate the failing behavior, repro path, and expected behavior` |
| Codex | `$maestro:debug-workflow Investigate the failing behavior, repro path, and expected behavior` |
| Qwen Code | `/maestro:debug Investigate the failing behavior, repro path, and expected behavior` |

Expected outcome: Maestro establishes the failing behavior, forms hypotheses, gathers evidence from code, logs, tests, and runtime behavior, then returns root cause, affected files, confidence level, and the smallest defensible next action.

Source: `src/entry-points/registry.js`

## Security Audit

Use this for authentication, authorization, secret handling, dependency, and data exposure risks.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:security-audit Audit authentication, authorization, data exposure, secret handling, and exploitability risks` |
| Claude Code | `/security-audit Audit authentication, authorization, data exposure, secret handling, and exploitability risks` |
| Codex | `$maestro:security-audit Audit authentication, authorization, data exposure, secret handling, and exploitability risks` |
| Qwen Code | `/maestro:security-audit Audit authentication, authorization, data exposure, secret handling, and exploitability risks` |

Expected outcome: Maestro reviews trust boundaries, auth flows, secret handling, and data exposure paths, then reports severity-classified findings with file references and exploitability assessment.

Source: `src/entry-points/registry.js`

## Performance Check

Use this when a feature or code path has latency, throughput, memory, or scaling concerns.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:perf-check Assess hotspots, regressions, and optimization opportunities in the requested code path` |
| Claude Code | `/perf-check Assess hotspots, regressions, and optimization opportunities in the requested code path` |
| Codex | `$maestro:perf-check Assess hotspots, regressions, and optimization opportunities in the requested code path` |
| Qwen Code | `/maestro:perf-check Assess hotspots, regressions, and optimization opportunities in the requested code path` |

Expected outcome: Maestro establishes the available baseline, identifies likely hotspots, prioritizes fixes by expected impact versus implementation cost, and reports measurement gaps when hard evidence is unavailable.

Source: `src/entry-points/registry.js`

## Accessibility Audit

Use this for WCAG, ARIA, keyboard navigation, focus management, and screen reader issues.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:a11y-audit Audit WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility` |
| Claude Code | `/a11y-audit Audit WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility` |
| Codex | `$maestro:a11y-audit Audit WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility` |
| Qwen Code | `/maestro:a11y-audit Audit WCAG compliance, ARIA usage, keyboard navigation, and screen reader compatibility` |

Expected outcome: Maestro audits WCAG compliance, ARIA usage, keyboard navigation, focus management, color contrast, and screen reader compatibility, then reports findings with WCAG criteria, severity, user impact, location, and remediation patterns.

Source: `src/entry-points/registry.js`

## SEO Audit

Use this for crawlability, meta tags, canonical URLs, structured data, and Core Web Vitals risks.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:seo-audit Audit meta tags, structured data, crawlability, and Core Web Vitals` |
| Claude Code | `/seo-audit Audit meta tags, structured data, crawlability, and Core Web Vitals` |
| Codex | `$maestro:seo-audit Audit meta tags, structured data, crawlability, and Core Web Vitals` |
| Qwen Code | `/maestro:seo-audit Audit meta tags, structured data, crawlability, and Core Web Vitals` |

Expected outcome: Maestro audits meta tags, schema markup, crawlability, canonicalization, internal linking, and Core Web Vitals, then reports findings with severity, SEO impact, location, and remediation guidance.

Source: `src/entry-points/registry.js`

## Compliance Check

Use this for GDPR, CCPA, cookie consent, retention, licensing, and third-party data handling concerns.

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:compliance-check Review GDPR/CCPA, cookie consent, data handling, and licensing risk` |
| Claude Code | `/compliance-check Review GDPR/CCPA, cookie consent, data handling, and licensing risk` |
| Codex | `$maestro:compliance-check Review GDPR/CCPA, cookie consent, data handling, and licensing risk` |
| Qwen Code | `/maestro:compliance-check Review GDPR/CCPA, cookie consent, data handling, and licensing risk` |

Expected outcome: Maestro reviews data handling, disclosures, consent flows, retention policies, and third-party integrations, then reports findings with regulatory reference, severity, compliance risk, and recommended actions.

Source: `src/entry-points/registry.js`

## Contributor Examples

Use these when changing Maestro itself.

### Edit Canonical Source

```bash
# edit source files under src/
node scripts/generate.js --diff
npm run build
just check
```

Expected outcome: generated runtime surfaces match canonical `src/` output with no drift.

Source: `docs/usage.md`, `justfile`

### Run Tests

```bash
node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js
```

For the local CI equivalent:

```bash
just ci
```

Expected outcome: generator drift, layer boundaries, and the Node test suite pass before committing.

Source: `justfile`, `package.json`

### Add or Update Documentation

```bash
# edit README.md, EXAMPLES.md, docs/*.md, or canonical src/ docs as appropriate
node --test tests/unit/doc-drift-guard.test.js
node scripts/generate.js --diff
```

Expected outcome: user-facing docs remain aligned with command names, runtime counts, MCP tool names, and generated-output rules, and the generator reports no additional pending runtime output. In CI or a clean worktree, `just check` covers the same drift check with `git diff --exit-code`.

Source: `tests/unit/doc-drift-guard.test.js`
