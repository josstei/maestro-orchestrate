# Agent System Architecture

This document describes how Maestro defines, constrains, and executes its local agent roster.

## Agent Definition Format

Agents are defined in `agents/*.md` with YAML frontmatter plus a Markdown system prompt body.

```yaml
---
name: coder
kind: local
description: "..."
tools:
  - read_file
  - write_file
  - run_shell_command
temperature: 0.2  # most agents; architect, api_designer, technical_writer use 0.3
max_turns: 25
timeout_mins: 10
---
```

Key fields:

- `name`: callable agent identifier and expected prompt filename stem for parallel dispatch
- `kind`: currently `local` for all Maestro agents
- `tools`: hard permission boundary enforced by Gemini CLI
- `temperature`, `max_turns`, `timeout_mins`: execution defaults used by delegation logic

## Baseline Tool Set

Every agent has this baseline:

- `read_file`
- `list_directory`
- `glob`
- `grep_search`
- `read_many_files`
- `ask_user`

## Current Agent Inventory

| Agent | Additional Tools Beyond Baseline | max_turns | timeout_mins |
| --- | --- | --- | --- |
| `architect` | `google_web_search`, `web_fetch` | 15 | 5 |
| `api_designer` | `google_web_search`, `web_fetch` | 15 | 5 |
| `code_reviewer` | none | 15 | 5 |
| `coder` | `write_file`, `replace`, `run_shell_command`, `write_todos`, `activate_skill` | 25 | 10 |
| `data_engineer` | `write_file`, `replace`, `run_shell_command`, `write_todos`, `google_web_search` | 20 | 8 |
| `debugger` | `run_shell_command`, `write_todos` | 20 | 8 |
| `devops_engineer` | `write_file`, `replace`, `run_shell_command`, `google_web_search`, `write_todos`, `web_fetch` | 20 | 8 |
| `performance_engineer` | `run_shell_command`, `google_web_search`, `write_todos`, `web_fetch` | 20 | 8 |
| `refactor` | `write_file`, `replace`, `write_todos`, `activate_skill` | 25 | 10 |
| `security_engineer` | `run_shell_command`, `google_web_search`, `web_fetch`, `write_todos` | 20 | 8 |
| `technical_writer` | `write_file`, `replace`, `google_web_search`, `write_todos` | 15 | 5 |
| `tester` | `write_file`, `replace`, `run_shell_command`, `write_todos`, `activate_skill`, `google_web_search` | 25 | 10 |

## Delegation Protocol Injection

Before subagent task instructions, Maestro delegation injects shared protocols from:

- `skills/delegation/protocols/agent-base-protocol.md`
- `skills/delegation/protocols/filesystem-safety-protocol.md`

This standardizes:

- pre-flight checks
- file-writing rules (`write_file`/`replace`, no shell content writes)
- handoff structure (`Task Report` and `Downstream Context`)
- filesystem safety behavior (`mkdir -p` precondition handling)

## Execution Paths

### Sequential Delegation

- Delegation happens via native subagent tool calls
- Agent model follows the main session model
- Approval behavior follows current session settings

### Parallel Dispatch

- Delegation is materialized into prompt files
- `node scripts/parallel-dispatch.js` starts independent `gemini` processes
- Per-agent model override is supported through dispatch flags:
  - `MAESTRO_DEFAULT_MODEL`
  - `MAESTRO_WRITER_MODEL` (technical_writer only)

## Active-Agent Tracking and Hook Integration

Parallel dispatch exports `MAESTRO_CURRENT_AGENT` per process. Hooks consume that identity to enforce middleware behavior:

- `hooks/before-agent.js` detects the active agent via `detectAgentFromPrompt()`: checks `MAESTRO_CURRENT_AGENT` env var first (set by parallel dispatch), then falls back to regex pattern matching on prompt text. Stores the resolved agent name in the hook state directory under `<session-id>/active-agent`.
- `hooks/after-agent.js` reads the active agent, validates handoff format, and clears the active agent from hook state. Validation is skipped for `techlead` and `orchestrator` agents.
- Hook state is stored under `/tmp/maestro-hooks` on Unix or `<os.tmpdir()>/maestro-hooks` on Windows.

## Practical Constraints

- Agent definition filenames use snake_case (e.g., `agents/technical_writer.md`). Parallel dispatch prompt filenames must match the agent definition name (e.g., `prompts/technical_writer.txt` maps to agent `technical_writer`).
- Parallel batches must avoid overlapping file ownership
- Tool permissions are enforced by `tools:` frontmatter, not prompt text alone
- Prompt-level tool restriction text remains defense-in-depth, not the primary boundary
