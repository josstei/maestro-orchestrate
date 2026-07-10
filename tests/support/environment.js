function applyEnv(overrides) {
  const previous = new Map();

  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function withEnvSync(overrides, fn) {
  const restore = applyEnv(overrides);

  try {
    return fn();
  } finally {
    restore();
  }
}

async function withEnv(overrides, fn) {
  const restore = applyEnv(overrides);

  try {
    return await fn();
  } finally {
    restore();
  }
}

export { withEnv, withEnvSync };
