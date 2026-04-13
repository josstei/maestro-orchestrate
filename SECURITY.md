# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.6.x   | Yes       |
| < 1.6   | No        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately via [GitHub Security Advisories](https://github.com/josstei/maestro-orchestrate/security/advisories/new).

Include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce or proof of concept
- Affected versions and runtimes (Gemini CLI, Claude Code, Codex)
- Potential impact

## Response Timeline

- **Acknowledgment**: Within 48 hours of report submission
- **Initial assessment**: Within 5 business days
- **Fix or mitigation**: Depends on severity; critical issues are prioritized

## Scope

The following areas are in scope for security reports:

- **MCP server** (`src/mcp/`) — tool handler input validation, path traversal, unauthorized data access
- **Hook scripts** (`src/hooks/`) — command injection, privilege escalation, state tampering
- **Generated code execution** — any scenario where the generator pipeline or transforms produce unsafe output
- **Session state** — unauthorized reads or writes to session data
- **Settings resolution** — environment variable injection or override bypass

Out of scope:

- Vulnerabilities in upstream runtimes (Gemini CLI, Claude Code, Codex) themselves
- Social engineering
- Denial of service against local development environments

## Disclosure

We follow coordinated disclosure. Once a fix is released, we will credit reporters (unless anonymity is requested) in the release notes.
