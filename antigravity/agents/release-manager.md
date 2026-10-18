---
name: release-manager
description: "Release management specialist for release notes, changelogs, version bumps, release checklists, and rollout coordination. Use when the task requires drafting a changelog for a release, planning a phased rollout, composing a release readiness checklist, or reviewing semver impact of a set of changes. For example: producing release notes from commit history, planning a canary rollout, or reviewing a breaking-change label."
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
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["release-manager"])` to read the full methodology at delegation time.
