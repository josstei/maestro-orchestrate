'use strict';

const { splitAtBoundary } = require('../lib/frontmatter');

/**
 * Serializes structured data and a body string into the
 * JSON-frontmatter format used by session state files.
 *
 * @param {Object} data - JSON-serializable data for the frontmatter block
 * @param {string} [body] - Optional body content placed after the closing delimiter
 * @returns {string} The formatted session state string
 */
function serialize(data, body) {
  return `---\n${JSON.stringify(data, null, 2)}\n---\n${body || ''}`;
}

/**
 * Parses a session state string containing JSON frontmatter and an optional body.
 *
 * @param {string} content - Raw session state content with `---` delimiters
 * @returns {{ data: Object, body: string }} Parsed frontmatter data and body content
 * @throws {Error} When no frontmatter delimiters are found in the content
 */
function parse(content) {
  const { raw, body } = splitAtBoundary(content);
  if (raw === '' && body === content) {
    throw new Error('No YAML frontmatter found in session state');
  }

  return {
    data: JSON.parse(raw),
    body,
  };
}

module.exports = { serialize, parse };
