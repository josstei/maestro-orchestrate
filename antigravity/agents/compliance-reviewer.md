---
name: compliance-reviewer
description: "Legal and regulatory compliance specialist for privacy auditing, GDPR/CCPA compliance, cookie consent implementation, data handling documentation, open-source license auditing, and terms of service review. Use when the task requires regulatory compliance assessment, privacy policy review, cookie consent architecture, or license compatibility checks. For example: auditing an app for GDPR compliance, designing cookie consent that satisfies ePrivacy, or checking open-source license compatibility."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - search_web
  - read_url_content
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["compliance-reviewer"])` to read the full methodology at delegation time.
