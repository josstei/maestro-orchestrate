'use strict';

function emitBlockList(key, items) {
  if (!items || items.length === 0) return [];
  return [`${key}:`, ...items.map((item) => `  - ${item}`)];
}

function emitInlineQuotedList(items) {
  return items.map((item) => `"${item}"`).join(', ');
}

module.exports = {
  emitBlockList,
  emitInlineQuotedList,
};
