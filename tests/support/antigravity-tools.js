'use strict';

/**
 * The tools Antigravity grants a subagent that lists them in its frontmatter
 * `tools`, verified against agy 1.4.2. Antigravity silently drops any other
 * name (multi_replace_file_content among them), so Maestro's agent stubs may
 * list only these.
 */
const ANTIGRAVITY_SUBAGENT_TOOLS = Object.freeze(new Set([
  'view_file',
  'list_dir',
  'find_by_name',
  'grep_search',
  'search_web',
  'read_url_content',
  'write_to_file',
  'replace_file_content',
  'run_command',
  'ask_question',
]));

module.exports = {
  ANTIGRAVITY_SUBAGENT_TOOLS,
};
