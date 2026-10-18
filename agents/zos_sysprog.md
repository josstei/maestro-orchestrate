---
name: zos_sysprog
kind: local
description: "z/OS systems programming specialist for JCL, USS, SMP/E, RACF, subsystem diagnostics, and batch scheduling. Use when the task requires JCL authoring or review, z/OS Unix System Services setup, SMP/E maintenance, RACF profile review, or diagnosing SYSLOG/OPERLOG issues. For example: writing a JCL restart procedure, planning an SMP/E PTF install, or reviewing RACF dataset profiles for least privilege."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - web_search
  - read_many_files
  - todo_write
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["zos-sysprog"])` to read the full methodology at delegation time.
