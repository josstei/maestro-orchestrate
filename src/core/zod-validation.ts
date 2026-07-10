import { z } from 'zod';
import { ValidationError } from '../lib/errors/index.js';

export interface ZodValidationDetails {
  readonly label: string;
  readonly errors: readonly string[];
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return String(JSON.stringify(value));
}

function describeNumericInput(value: unknown): string {
  if (typeof value !== 'string') return describeType(value);
  const parsed = Number(value);
  return describeType(Number.isFinite(parsed) ? parsed : value);
}

function valueAtPath(value: unknown, issuePath: readonly (string | number)[]): unknown {
  let current = value;
  for (const segment of issuePath) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function parentAtPath(value: unknown, issuePath: readonly (string | number)[]): unknown {
  return issuePath.length === 0 ? undefined : valueAtPath(value, issuePath.slice(0, -1));
}

function isMissingProperty(value: unknown, issuePath: readonly (string | number)[]): boolean {
  if (issuePath.length === 0) return false;
  const parent = parentAtPath(value, issuePath);
  const key = issuePath[issuePath.length - 1];
  return parent !== null
    && typeof parent === 'object'
    && key !== undefined
    && !Object.prototype.hasOwnProperty.call(parent, key);
}

function formatIssueLabel(label: string, issuePath: readonly (string | number)[]): string {
  let result = label;
  for (const segment of issuePath) {
    result = typeof segment === 'number' ? `${result}[${segment}]` : `${result}.${segment}`;
  }
  return result;
}

function formatIssue(issue: z.ZodIssue, value: unknown, label: string): string {
  const issueLabel = formatIssueLabel(label, issue.path);
  const received = valueAtPath(value, issue.path);

  if (
    issue.code === z.ZodIssueCode.invalid_type
    && issue.received === z.ZodParsedType.undefined
    && isMissingProperty(value, issue.path)
  ) {
    return `${issueLabel}: missing required field`;
  }

  if (issue.code === z.ZodIssueCode.invalid_type) {
    const expected = issue.expected === z.ZodParsedType.number ? 'integer' : issue.expected;
    const actual = expected === 'integer' ? describeNumericInput(received) : describeType(received);
    return `${issueLabel}: expected ${expected}, got ${actual}`;
  }

  if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    return `${issueLabel}: expected one of [${issue.options.join(', ')}], got ${describeType(received)}`;
  }

  if (
    issue.code === z.ZodIssueCode.too_small
    && issue.type === 'number'
    && issue.inclusive
  ) {
    return `${issueLabel}: expected integer >= ${issue.minimum}, got ${describeNumericInput(received)}`;
  }

  return `${issueLabel}: ${issue.message}`;
}

function sameIssuePath(left: z.ZodIssue, right: z.ZodIssue): boolean {
  return left.path.length === right.path.length
    && left.path.every((segment, index) => segment === right.path[index]);
}

function normalizeIssues(issues: readonly z.ZodIssue[]): readonly z.ZodIssue[] {
  return issues.filter((issue) => {
    if (issue.code !== z.ZodIssueCode.too_small || issue.type !== 'number') return true;
    return !issues.some((candidate) =>
      candidate.code === z.ZodIssueCode.invalid_type
      && candidate.expected === 'integer'
      && sameIssuePath(candidate, issue)
    );
  });
}

function parseOrThrow<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
  label = 'value',
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const errors = normalizeIssues(result.error.issues).map((issue) => formatIssue(issue, value, label));
  const details: ZodValidationDetails = { label, errors };
  throw new ValidationError(
    `Schema validation failed for ${label}:\n  - ${errors.join('\n  - ')}`,
    { details },
  );
}

export { parseOrThrow };
