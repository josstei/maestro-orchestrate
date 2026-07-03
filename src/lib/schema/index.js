'use strict';

const { ValidationError } = require('../errors');

const string = () => ({ kind: 'string' });
const integer = (opts = {}) => ({ kind: 'integer', min: opts.min == null ? null : opts.min });
const boolean = () => ({ kind: 'boolean' });
const enumOf = (values) => ({ kind: 'enum', values });
const arrayOf = (item) => ({ kind: 'array', item });
const csv = (item = string()) => ({ kind: 'csv', item });
const recordOf = (value) => ({ kind: 'record', value });
const shape = (fields, opts = {}) => ({ kind: 'shape', fields, optional: opts.optional || [] });

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return JSON.stringify(value);
}

/**
 * Structurally validate a value against a schema node.
 * @param {object} schema - A schema node produced by a factory
 * @param {*} value - The value under test
 * @param {string} [label='value'] - Path label used in error messages
 * @returns {string[]} Human-readable errors (empty when valid)
 */
function validate(schema, value, label = 'value') {
  switch (schema.kind) {
    case 'string':
      return typeof value === 'string' ? [] : [`${label}: expected string, got ${describeType(value)}`];
    case 'integer': {
      if (!Number.isInteger(value)) {
        return [`${label}: expected integer, got ${describeType(value)}`];
      }
      if (schema.min != null && value < schema.min) {
        return [`${label}: expected integer >= ${schema.min}, got ${value}`];
      }
      return [];
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${label}: expected boolean, got ${describeType(value)}`];
    case 'enum':
      return schema.values.includes(value)
        ? []
        : [`${label}: expected one of [${schema.values.join(', ')}], got ${describeType(value)}`];
    case 'array':
    case 'csv': {
      if (!Array.isArray(value)) return [`${label}: expected array, got ${describeType(value)}`];
      const errors = [];
      value.forEach((item, index) => {
        errors.push(...validate(schema.item, item, `${label}[${index}]`));
      });
      return errors;
    }
    case 'record': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return [`${label}: expected object, got ${describeType(value)}`];
      }
      const errors = [];
      for (const [key, entry] of Object.entries(value)) {
        errors.push(...validate(schema.value, entry, `${label}.${key}`));
      }
      return errors;
    }
    case 'shape': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return [`${label}: expected object, got ${describeType(value)}`];
      }
      const errors = [];
      const optional = new Set(schema.optional);
      for (const [field, fieldSchema] of Object.entries(schema.fields)) {
        if (!(field in value)) {
          if (!optional.has(field)) errors.push(`${label}.${field}: missing required field`);
          continue;
        }
        errors.push(...validate(fieldSchema, value[field], `${label}.${field}`));
      }
      return errors;
    }
    default:
      return [`${label}: unknown schema kind "${schema.kind}"`];
  }
}

/**
 * Validate and throw a ValidationError when the value is invalid.
 * @param {object} schema
 * @param {*} value
 * @param {string} [label='value']
 * @throws {ValidationError}
 */
function assertValid(schema, value, label = 'value') {
  const errors = validate(schema, value, label);
  if (errors.length > 0) {
    throw new ValidationError(
      `Schema validation failed for ${label}:\n  - ${errors.join('\n  - ')}`,
      { details: { label, errors } }
    );
  }
}

/**
 * Coerce a raw environment string into the scalar type a schema expects.
 * Never throws — un-coercible input is returned unchanged so assertValid
 * can surface a typed, labelled error.
 * @param {object} schema
 * @param {string} raw
 * @returns {*}
 */
function coerceScalar(schema, raw) {
  switch (schema.kind) {
    case 'integer': {
      const num = Number(raw);
      return Number.isFinite(num) ? num : raw;
    }
    case 'boolean': {
      const normalized = String(raw).trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      return raw;
    }
    case 'csv':
      return String(raw)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    default:
      return raw;
  }
}

module.exports = {
  string,
  integer,
  boolean,
  enumOf,
  arrayOf,
  csv,
  recordOf,
  shape,
  validate,
  assertValid,
  coerceScalar,
};
