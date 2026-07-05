import { shape, recordOf, arrayOf, string, enumOf, assertValid } from '../lib/schema/index.js';
const CAPABILITY_TIERS = ['read_only', 'read_shell', 'read_write', 'full'];

const agentEntrySchema = shape({
  name: string(),
  capabilities: enumOf(CAPABILITY_TIERS),
  tools: arrayOf(string()),
  focus: string(),
});

const hookEntrySchema = shape({
  module: string(),
  fn: string(),
});

const REGISTRY_SCHEMAS = {
  'agent-registry.json': arrayOf(agentEntrySchema),
  'resource-registry.json': recordOf(string()),
  'hook-registry.json': recordOf(hookEntrySchema),
};

/**
 * Assert a generated registry payload matches its declared shape.
 * @param {string} fileName - Registry filename (key into REGISTRY_SCHEMAS)
 * @param {*} data - The registry data about to be serialized
 * @throws {Error} When no schema is registered for the filename
 * @throws {import('../lib/errors').ValidationError} On a shape violation
 */
function validateRegistry(fileName, data) {
  const schema = REGISTRY_SCHEMAS[fileName];
  if (!schema) {
    throw new Error(`No schema registered for "${fileName}"`);
  }
  assertValid(schema, data, fileName);
}

export { REGISTRY_SCHEMAS, CAPABILITY_TIERS, validateRegistry };
