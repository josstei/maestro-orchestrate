'use strict';

const {
  createCompositionContext,
} = require('../tool-packs/contracts');

function normalizeToolPack(entry, context, index) {
  let pack = entry;

  if (pack && typeof pack.createToolPack === 'function') {
    pack = pack.createToolPack(context);
  } else if (typeof pack === 'function') {
    pack = pack(context);
  }

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new TypeError(`Tool pack at index ${index} must resolve to an object.`);
  }

  return {
    name: pack.name || `tool-pack-${index + 1}`,
    tools: Array.isArray(pack.tools) ? pack.tools : [],
    handlers: pack.handlers && typeof pack.handlers === 'object' ? pack.handlers : {},
  };
}

function createToolRegistry(options = {}) {
  const context = createCompositionContext(options);
  const rawToolPacks = Array.isArray(options.toolPacks) ? options.toolPacks : [];
  const toolPacks = rawToolPacks.map((entry, index) =>
    normalizeToolPack(entry, context, index)
  );
  const schemas = [];
  const handlers = Object.create(null);
  const toolSources = Object.create(null);
  const metadata = Object.create(null);

  for (const pack of toolPacks) {
    for (const schema of pack.tools) {
      if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        throw new TypeError(`Tool schema in pack "${pack.name}" must be an object.`);
      }

      if (typeof schema.name !== 'string' || schema.name.length === 0) {
        throw new Error(`Tool schema in pack "${pack.name}" is missing a valid name.`);
      }

      if (toolSources[schema.name]) {
        throw new Error(
          `Duplicate tool name "${schema.name}" found in packs "${toolSources[schema.name]}" and "${pack.name}".`
        );
      }

      const handler = pack.handlers[schema.name];
      if (typeof handler !== 'function') {
        throw new Error(
          `Tool "${schema.name}" in pack "${pack.name}" is missing a handler.`
        );
      }

      toolSources[schema.name] = pack.name;
      schemas.push(schema);
      handlers[schema.name] = handler;
      metadata[schema.name] = {
        requiresWorkspace: schema.requiresWorkspace === true,
      };
    }
  }

  return {
    context,
    toolPacks,
    schemas,
    handlers,
    metadata,
  };
}

module.exports = {
  createToolRegistry,
  normalizeToolPack,
};
