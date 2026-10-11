'use strict';

/**
 * Runs `fn` with `process.env` temporarily overridden, then restores every
 * overridden key to its previous value. A null or undefined override deletes
 * the key. When `fn` returns a promise, the environment is restored once that
 * promise settles and the chained promise is returned. When `fn` throws
 * synchronously, the environment is restored and the error is rethrown.
 *
 * @template T
 * @param {Record<string, string | null | undefined>} overrides - Environment values to apply
 * @param {() => T} fn - Callback to run while the overrides are in place
 * @returns {T} The callback's result
 */
function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
  }

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }

  if (result && typeof result.then === 'function') {
    return result.then(
      (value) => {
        restore();
        return value;
      },
      (error) => {
        restore();
        throw error;
      }
    );
  }

  restore();
  return result;
}

module.exports = {
  withEnv,
};
