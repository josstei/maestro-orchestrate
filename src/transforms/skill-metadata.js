'use strict';

const { splitAtBoundary } = require('../lib/frontmatter');

function skillMetadata(content, runtime) {
  if (runtime.name !== 'claude') return content;

  const { raw, body } = splitAtBoundary(content);
  if (!raw) return content;

  return '---\n' + raw + '\nuser-invocable: false\n---' + (body ? '\n' + body : '');
}

module.exports = skillMetadata;
