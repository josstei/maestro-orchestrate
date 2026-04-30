#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Publish a Maestro npm package if the exact version is absent.

Usage:
  node scripts/npm-publish-idempotent.js [--tag TAG] [--access public]
`);
}

function parseArgs(argv) {
  const options = {
    access: 'public',
    tag: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--access') {
      options.access = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--tag') {
      options.tag = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.access) {
    throw new Error('Missing value for --access');
  }

  if (options.tag === undefined) {
    throw new Error('Missing value for --tag');
  }

  return options;
}

function readPackage(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
    throw new Error('package.json missing package name');
  }

  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json missing package version');
  }

  return pkg;
}

function isNpmNotFoundError(error) {
  const text = [
    error && error.message,
    error && error.stdout && error.stdout.toString(),
    error && error.stderr && error.stderr.toString(),
  ].filter(Boolean).join('\n');

  return /\bE404\b|404 Not Found|is not in this registry/i.test(text);
}

function packageVersionExists(packageSpec, runner) {
  try {
    const stdout = runner('npm', ['view', packageSpec, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return stdout.toString().trim().length > 0;
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function publishIfNeeded(options = {}) {
  const root = options.root || ROOT;
  const runner = options.execFileSync || execFileSync;
  const pkg = readPackage(root);
  const packageSpec = `${pkg.name}@${pkg.version}`;

  if (packageVersionExists(packageSpec, runner)) {
    return {
      packageSpec,
      published: false,
    };
  }

  const publishArgs = ['publish'];
  if (options.tag) {
    publishArgs.push('--tag', options.tag);
  }
  publishArgs.push('--access', options.access || 'public');

  runner('npm', publishArgs, {
    cwd: root,
    stdio: 'inherit',
  });

  return {
    packageSpec,
    published: true,
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = publishIfNeeded(options);

    if (result.published) {
      console.log(`Published ${result.packageSpec}`);
    } else {
      console.log(`Skipping npm publish; ${result.packageSpec} already exists`);
    }
  } catch (error) {
    console.error(`npm publish failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  isNpmNotFoundError,
  packageVersionExists,
  parseArgs,
  publishIfNeeded,
  readPackage,
};
