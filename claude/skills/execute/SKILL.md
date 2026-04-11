---
name: execute
description: Execute an approved Maestro implementation plan using the shared session-state contract
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - Skill
  - EnterPlanMode
  - ExitPlanMode
---

## Setup

1. Call `get_runtime_context` if it appears in your available tools. Use the returned tool mappings,
   agent dispatch syntax, MCP prefix, and paths throughout this session.
2. If `get_runtime_context` is unavailable, use this compact fallback:
   - Core tools: read_file=Read, write_file=Write, replace=Edit, run_shell_command=Bash, glob=Glob, grep_search=Grep, activate_skill=Skill, ask_user=AskUserQuestion, enter_plan_mode=EnterPlanMode, exit_plan_mode=ExitPlanMode
   - Extended tools: google_web_search=WebSearch, web_fetch=WebFetch, write_todos=[TaskCreate,TaskUpdate,TaskList], read_many_files=Read, list_directory=Glob, codebase_investigator=Agent (Explore) / Grep / Glob
   - Agent dispatch: Agent(subagent_type: "maestro:<name>", prompt: "...")
   - MCP prefix: mcp__plugin_maestro_maestro__
   - Shared skills/templates/references/protocols: call `get_skill_content(resources: ["<name>"])`

## Execute

Call `get_skill_content` with resources: ["execution", "delegation", "session-management", "validation"].

Read the approved implementation plan at the user-provided path (or check `docs/maestro/plans/` for the most recent plan). Resolve the execution mode gate, create or resume session state, then execute phases through child agents following the loaded methodology.
