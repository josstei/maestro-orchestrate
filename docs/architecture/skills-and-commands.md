# Skills and Commands System

This document maps Maestro slash commands to skill activation and execution behavior.

## Command Namespace

Maestro commands are defined in `commands/maestro/*.toml` and invoked with `/maestro:<command>`.

Gemini CLI command-loader constraints in effect:

- `prompt` is required in each `.toml`; `description` is optional.
- Extension commands are loaded alongside user/project command directories and namespaced to avoid conflicts.
- Command prompt injections (`{{args}}`, `!{...}`) are processed through Gemini CLI prompt processors and safety checks.
- Folder trust settings can disable extension command loading in untrusted workspaces.

## Command Catalog

| Command | Prompt File | Primary Behavior | Skill Usage |
| --- | --- | --- | --- |
| `/maestro:orchestrate` | `commands/maestro/orchestrate.toml` | Full orchestration entry point | Starts with `design-dialogue`; workflow later uses planning/execution/session skills; final `code_reviewer` quality gate runs directly in Phase 4 (Complete) before archival |
| `/maestro:execute` | `commands/maestro/execute.toml` | Execute existing implementation plan | `execution`, `delegation`, `session-management`, `validation`; final `code_reviewer` quality gate runs directly before archival |
| `/maestro:resume` | `commands/maestro/resume.toml` | Resume active session | `session-management`, `execution`, `delegation`, `validation` |
| `/maestro:status` | `commands/maestro/status.toml` | Read-only status report | No skill activation required |
| `/maestro:archive` | `commands/maestro/archive.toml` | Archive active session | `session-management` |
| `/maestro:review` | `commands/maestro/review.toml` | Standalone review workflow | `code-review` |
| `/maestro:debug` | `commands/maestro/debug.toml` | Root-cause analysis workflow | Delegates to `debugger` agent |
| `/maestro:perf-check` | `commands/maestro/perf-check.toml` | Performance analysis workflow | Delegates to `performance_engineer` agent |
| `/maestro:security-audit` | `commands/maestro/security-audit.toml` | Security analysis workflow | Delegates to `security_engineer` agent |

## Prompt Safety Pattern

Command prompts wrap user args in `<user-request>` tags where applicable and instruct the orchestrator to treat them as data, not override instructions. Commands that take no arguments (e.g., `archive`) omit this pattern.

Example:

```xml
<user-request>
{{args}}
</user-request>
```

State-aware commands also inject script output:

```bash
!{extension_root="${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}"; script="$extension_root/scripts/read-active-session.js"; if [[ -f "$script" ]]; then node "$script"; else echo "No active session"; fi}
```

## Skill Catalog

| Skill | Source | Used For |
| --- | --- | --- |
| `design-dialogue` | `skills/design-dialogue/SKILL.md` | Requirements and architecture convergence |
| `implementation-planning` | `skills/implementation-planning/SKILL.md` | Phase decomposition, dependency graph, execution plan |
| `execution` | `skills/execution/SKILL.md` | Phase execution, retries, result processing |
| `delegation` | `skills/delegation/SKILL.md` | Subagent prompt construction and scope controls |
| `session-management` | `skills/session-management/SKILL.md` | Session state create/update/resume/archive |
| `code-review` | `skills/code-review/SKILL.md` | Structured review methodology and reporting |
| `validation` | `skills/validation/SKILL.md` | Build/lint/test validation pipeline and strictness handling |

## Delegation Protocol Files

The delegation skill injects two shared protocol files before task-specific instructions:

- `skills/delegation/protocols/agent-base-protocol.md`
- `skills/delegation/protocols/filesystem-safety-protocol.md`

These are not in a top-level `/protocols` directory; the authoritative location is under `skills/delegation/protocols/`.

## Skill Activation Semantics

- Maestro skills are extension-provided, not builtin
- `activate_skill` requires user confirmation unless policy/approval configuration auto-allows it
- Skills should be activated only when needed to avoid unnecessary context expansion

Gemini CLI discovery and precedence:

- Skill sources merge in precedence order: built-in, extension, user, then workspace.
- Workspace skill loading depends on trust settings.
- Name collisions are resolved by precedence and surfaced with warnings.

## Execution and Command Coupling Notes

- `/maestro:status` is read-only by prompt contract
- `/maestro:resume` and `/maestro:status` both depend on `scripts/read-active-session.js`
- Parallel execution behavior is implemented by `scripts/parallel-dispatch.js` and documented in:
  - `skills/execution/SKILL.md`
  - `skills/delegation/SKILL.md`
  - `docs/architecture/state-management-and-scripts.md`
