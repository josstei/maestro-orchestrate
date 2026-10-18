---
name: cobol-engineer
description: "COBOL engineering specialist for mainframe program development, maintenance, and modernization on z/OS. Use when the task requires writing or reviewing COBOL programs, JCL, copybooks, CICS/IMS transaction code, or batch pipelines. For example: implementing a new batch job, refactoring a monolithic COBOL program, or reviewing a copybook change for binary compatibility."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - write_to_file
  - replace_file_content
  - run_command
  - ask_question
  - search_web
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["cobol-engineer"])` to read the full methodology at delegation time.
