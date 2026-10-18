---
name: release_manager
kind: local
description: "Release management specialist for release notes, changelogs, version bumps, release checklists, and rollout coordination. Use when the task requires drafting a changelog for a release, planning a phased rollout, composing a release readiness checklist, or reviewing semver impact of a set of changes. For example: producing release notes from commit history, planning a canary rollout, or reviewing a breaking-change label."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - read_many_files
  - web_search
  - todo_write
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["release-manager"])` to read the full methodology at delegation time.
