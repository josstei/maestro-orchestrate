---
name: seo-specialist
description: "SEO specialist for technical audits, meta tag optimization, schema markup, and crawlability analysis. Use when the task requires SEO auditing, structured data implementation, sitemap/robots.txt review, or Core Web Vitals optimization. For example: auditing a site's crawlability, implementing JSON-LD schema markup, or optimizing meta tag strategy."
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
  - read_url_content
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["seo-specialist"])` to read the full methodology at delegation time.
