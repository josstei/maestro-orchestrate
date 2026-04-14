'use strict';

const { parse } = require('../lib/frontmatter');

/**
 * Transform: parse-frontmatter
 *
 * Parses YAML frontmatter from agent content and stores the parsed
 * frontmatter object and body string into the shared pipeline state.
 *
 * @param {string} content  - Full agent file with --- delimited frontmatter
 * @param {object} _runtime - Runtime config (unused)
 * @param {object} options  - Pipeline options with shared state
 * @returns {string} Content passed through unchanged
 */
function parseFrontmatterTransform(content, _runtime, options) {
  const { frontmatter, body } = parse(content);
  options.state.frontmatter = frontmatter;
  options.state.body = body;
  return content;
}

module.exports = parseFrontmatterTransform;
