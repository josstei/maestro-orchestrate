import { ValidationError } from '../errors/index.js';
export type Schema =
  | { readonly kind: 'string' }
  | { readonly kind: 'integer'; readonly min: number | null }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly unknown[] }
  | { readonly kind: 'array'; readonly item: Schema }
  | { readonly kind: 'csv'; readonly item: Schema }
  | { readonly kind: 'record'; readonly value: Schema }
  | { readonly kind: 'shape'; readonly fields: Readonly<Record<string, Schema>>; readonly optional: readonly string[] };

export interface IntegerOptions {
  readonly min?: number | null;
}

export interface ShapeOptions {
  readonly optional?: readonly string[];
}

const string = (): Schema => ({ kind: 'string' });
const integer = (opts: IntegerOptions = {}): Schema => ({ kind: 'integer', min: opts.min == null ? null : opts.min });
const boolean = (): Schema => ({ kind: 'boolean' });
const enumOf = (values: readonly unknown[]): Schema => ({ kind: 'enum', values });
const arrayOf = (item: Schema): Schema => ({ kind: 'array', item });
const csv = (item: Schema = string()): Schema => ({ kind: 'csv', item });
const recordOf = (value: Schema): Schema => ({ kind: 'record', value });
const shape = (fields: Readonly<Record<string, Schema>>, opts: ShapeOptions = {}): Schema => ({ kind: 'shape', fields, optional: opts.optional || [] });

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return JSON.stringify(value);
}

/**
 * Structurally validate a value against a schema node.
 */
function validate(schema: Schema, value: unknown, label = 'value'): string[] {
  switch (schema.kind) {
    case 'string':
      return typeof value === 'string' ? [] : [`${label}: expected string, got ${describeType(value)}`];
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
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
      const errors: string[] = [];
      value.forEach((item, index) => {
        errors.push(...validate(schema.item, item, `${label}[${index}]`));
      });
      return errors;
    }
    case 'record': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return [`${label}: expected object, got ${describeType(value)}`];
      }
      const errors: string[] = [];
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        errors.push(...validate(schema.value, entry, `${label}.${key}`));
      }
      return errors;
    }
    case 'shape': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return [`${label}: expected object, got ${describeType(value)}`];
      }
      const errors: string[] = [];
      const optional = new Set(schema.optional);
      const record = value as Record<string, unknown>;
      for (const [field, fieldSchema] of Object.entries(schema.fields)) {
        if (!(field in record)) {
          if (!optional.has(field)) errors.push(`${label}.${field}: missing required field`);
          continue;
        }
        errors.push(...validate(fieldSchema, record[field], `${label}.${field}`));
      }
      return errors;
    }
    default:
      return [`${label}: unknown schema kind "${(schema as { kind?: string }).kind}"`];
  }
}

/**
 * Validate and throw a ValidationError when the value is invalid.
 */
function assertValid(schema: Schema, value: unknown, label = 'value'): void {
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
 */
function coerceScalar(schema: Schema, raw: string): unknown {
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

export { string, integer, boolean, enumOf, arrayOf, csv, recordOf, shape, validate, assertValid, coerceScalar };
