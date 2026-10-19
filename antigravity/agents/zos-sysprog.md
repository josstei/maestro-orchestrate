---
name: zos-sysprog
description: "z/OS systems programming specialist for JCL, USS, SMP/E, RACF, subsystem diagnostics, and batch scheduling. Use when the task requires JCL authoring or review, z/OS Unix System Services setup, SMP/E maintenance, RACF profile review, or diagnosing SYSLOG/OPERLOG issues. For example: writing a JCL restart procedure, planning an SMP/E PTF install, or reviewing RACF dataset profiles for least privilege."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - run_command
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["zos-sysprog"])` to read the full methodology at delegation time.
