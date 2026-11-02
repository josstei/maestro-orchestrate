'use strict';

// Canonical names are kebab-case: 'api-designer', 'session-start'.
const capitalizeParts = (name) =>
  name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1));

function toSnakeCase(name) {
  return name.replace(/-/g, '_');
}

function toPascalCase(name) {
  return capitalizeParts(name).join('');
}

function toTitleCase(name) {
  return capitalizeParts(name).join(' ');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A canonical name in a runtime's agentNaming; any case but 'snake_case' keeps it. */
function toNamingConvention(name, targetCase) {
  return targetCase === 'snake_case' ? toSnakeCase(name) : name;
}

module.exports = {
  toSnakeCase,
  toPascalCase,
  toTitleCase,
  escapeRegExp,
  toNamingConvention,
};
