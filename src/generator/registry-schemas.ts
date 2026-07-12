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

const REGISTRY_SCHEMAS = {
  'agent-registry.json': z.array(agentEntrySchema),
  'resource-registry.json': z.record(z.string()),
  'hook-registry.json': z.record(hookEntrySchema),
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
