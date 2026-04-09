# Maestro — Gemini CLI Extension

[![Version](https://img.shields.io/badge/version-1.6.0-blue)](https://github.com/josstei/maestro-orchestrate/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-extension-orange)](https://github.com/google-gemini/gemini-cli)

Maestro is a multi-agent orchestration extension for Gemini CLI. It exposes 22 specialist agents, Express and Standard workflows, lifecycle hooks, TOML shell policies, and standalone review/debug/security/perf/seo/accessibility/compliance commands.

## Prerequisites

Gemini CLI requires experimental subagents:

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

Set that in `~/.gemini/settings.json` before running orchestration commands. Maestro does not edit the file automatically.

## Installation

Install from GitHub:

```bash
gemini extensions install https://github.com/josstei/maestro-orchestrate
```

Local development:

```bash
git clone https://github.com/josstei/maestro-orchestrate
cd maestro-orchestrate
gemini extensions link .
```

Verify with `gemini extensions list`.

## Runtime Surface

- Public commands resolve as `/maestro:*`
- Agent names use snake_case such as `code_reviewer` and `accessibility_specialist`
- Hook entrypoints live in `hooks/`
- Shell guardrails live in `policies/maestro.toml`
- The MCP server entrypoint is `mcp/maestro-server.js`
- Session state defaults to `docs/maestro/`

## Core Commands

| Command | Purpose |
|---------|---------|
| `/maestro:orchestrate` | Full orchestration workflow |
| `/maestro:execute` | Execute an approved implementation plan |
| `/maestro:resume` | Resume an interrupted session |
| `/maestro:status` | Show active session status |
| `/maestro:archive` | Archive the active session |
| `/maestro:review` | Standalone code review |
| `/maestro:debug` | Standalone debugging workflow |
| `/maestro:security-audit` | Standalone security assessment |
| `/maestro:perf-check` | Standalone performance assessment |
| `/maestro:seo-audit` | Standalone SEO audit |
| `/maestro:a11y-audit` | Standalone accessibility audit |
| `/maestro:compliance-check` | Standalone compliance review |

## Notes

- Workflow instructions for the Gemini orchestrator live in `GEMINI.md`.
- Runtime implementation is generated from canonical source in `src/`.
- Regenerate runtime output with `node scripts/generate.js` after editing canonical files.
