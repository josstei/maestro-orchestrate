'use strict';

// Session state files: pretty-printed JSON between `---` delimiters, then an optional body.
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function serialize(data, body) {
  return `---\n${JSON.stringify(data, null, 2)}\n---\n${body || ''}`;
}

function parse(content) {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new Error('No frontmatter found in session state');
  }

  return {
    data: JSON.parse(match[1]),
    body: match[2],
  };
}

module.exports = { serialize, parse };
