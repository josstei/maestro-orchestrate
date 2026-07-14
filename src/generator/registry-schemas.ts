import { z } from 'zod';
import { parseOrThrow } from '../core/zod-validation.js';

const CAPABILITY_TIERS = ['read_only', 'read_shell', 'read_write', 'full'] as const;

const agentEntrySchema = z.object({
  name: z.string(),
  capabilities: z.enum(CAPABILITY_TIERS),
  tools: z.array(z.string()),
  focus: z.string(),
}).passthrough();

const hookEntrySchema = z.object({
  module: z.string(),
  fn: z.string(),
}).passthrough();

const inlineRuntimeContentEntrySchema = z.object({
  kind: z.literal('inline'),
  relativePath: z.string(),
  content: z.string(),
}).strict();

const packedRuntimeContentEntrySchema = z.union([
  z.tuple([
    z.string(),
    z.number().int().nonnegative().safe(),
    z.number().int().nonnegative().safe(),
  ]),
  inlineRuntimeContentEntrySchema,
]);

function runtimeContentSections<T extends z.ZodTypeAny>(entrySchema: T) {
  return {
    resources: z.record(entrySchema),
    agents: z.record(entrySchema),
    agentProfiles: z.record(entrySchema),
    blueprints: z.record(entrySchema),
  };
}

const runtimeContentRegistrySchema = z.discriminatedUnion('storage', [
  z.object({
    schemaVersion: z.literal(2),
    storage: z.literal('file'),
    ...runtimeContentSections(z.string()),
  }).strict(),
  z.object({
    schemaVersion: z.literal(2),
    storage: z.literal('packed'),
    payload: z.string(),
    payloadEncoding: z.literal('gzip'),
    ...runtimeContentSections(packedRuntimeContentEntrySchema),
  }).strict(),
  z.object({
    schemaVersion: z.literal(2),
    storage: z.literal('inline'),
    ...runtimeContentSections(inlineRuntimeContentEntrySchema),
  }).strict(),
]);

const REGISTRY_SCHEMAS = {
  'agent-registry.json': z.array(agentEntrySchema),
  'resource-registry.json': z.record(z.string()),
  'hook-registry.json': z.record(hookEntrySchema),
  'runtime-content-registry.json': runtimeContentRegistrySchema,
};

/**
 * Assert a generated registry payload matches its declared shape.
 * @param {string} fileName - Registry filename (key into REGISTRY_SCHEMAS)
 * @param {*} data - The registry data about to be serialized
 * @throws {Error} When no schema is registered for the filename
 * @throws {import('../lib/errors').ValidationError} On a shape violation
 */
function validateRegistry(fileName: string, data: unknown): void {
  const schema = (REGISTRY_SCHEMAS as Record<string, z.ZodTypeAny>)[fileName];
  if (!schema) {
    throw new Error(`No schema registered for "${fileName}"`);
  }
  parseOrThrow(schema, data, fileName);
}

export { REGISTRY_SCHEMAS, CAPABILITY_TIERS, validateRegistry };
