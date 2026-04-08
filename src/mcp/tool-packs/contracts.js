'use strict';

function createCompositionContext(options = {}) {
  const runtimeConfig =
    options.runtimeConfig && typeof options.runtimeConfig === 'object'
      ? options.runtimeConfig
      : {};
  const services =
    options.services && typeof options.services === 'object'
      ? options.services
      : {};

  return Object.freeze({
    runtimeConfig,
    services,
  });
}

function defineToolPack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new TypeError('Tool pack must be an object.');
  }

  return pack;
}

module.exports = {
  createCompositionContext,
  defineToolPack,
};
