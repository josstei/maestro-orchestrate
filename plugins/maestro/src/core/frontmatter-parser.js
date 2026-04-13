'use strict';

const lib = require('../lib/frontmatter');

module.exports = {
  parse: lib.parse,
  parseFrontmatterOnly(content) {
    return lib.parseFrontmatterOnly(content).frontmatter;
  },
  extractValue: lib.extractValue,
  parseValue: lib.parseValue,
  parseDoubleQuotedValue: lib.parseDoubleQuotedValue,
};
