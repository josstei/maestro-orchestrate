---
name: seo_specialist
kind: local
description: "SEO specialist for technical audits, meta tag optimization, schema markup, and crawlability analysis. Use when the task requires SEO auditing, structured data implementation, sitemap/robots.txt review, or Core Web Vitals optimization. For example: auditing a site's crawlability, implementing JSON-LD schema markup, or optimizing meta tag strategy."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - web_search
  - web_fetch
  - todo_write
  - read_many_files
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["seo-specialist"])` to read the full methodology at delegation time.
