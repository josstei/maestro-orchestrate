#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PRERELEASE_TAGS = new Set(['rc', 'preview', 'nightly']);

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

function isPrereleaseVersion(version) {
  return /^[0-9]+\.[0-9]+\.[0-9]+-.+/.test(version);
}

function isStableVersion(version) {
  return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
}

function compareStableVersions(left, right) {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function highestStableVersion(versions) {
  return versions
    .filter(isStableVersion)
    .sort(compareStableVersions)
    .at(-1) || null;
}

function parseDistTagOutput(output) {
  const tags = {};
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : String(output || '');

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:\s]+):\s*(\S+)\s*$/);
    if (match) {
      tags[match[1]] = match[2];
    }
  }

  return tags;
}

function parseVersionsOutput(output) {
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : String(output || '');
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (typeof parsed === 'string') {
    return [parsed];
  }

  return [];
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

function getDistTags(packageName, runner) {
  try {
    const stdout = runner('npm', ['dist-tag', 'ls', packageName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseDistTagOutput(stdout);
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return {};
    }

    throw error;
  }
}

function getPublishedVersions(packageName, runner) {
  try {
    const stdout = runner('npm', ['view', packageName, 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseVersionsOutput(stdout);
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

function validatePublishTag(pkg, tag) {
  const prerelease = isPrereleaseVersion(pkg.version);

  if (prerelease && (!tag || tag === 'latest')) {
    throw new Error(
      `Refusing to publish prerelease ${pkg.name}@${pkg.version} with the latest tag; use rc, preview, or nightly.`
    );
  }

  if (!prerelease && PRERELEASE_TAGS.has(tag)) {
    throw new Error(
      `Refusing to publish stable ${pkg.name}@${pkg.version} with prerelease tag "${tag}".`
    );
  }
}

function ensureLatestTagPolicy(pkg, runner, logger = console) {
  const tags = getDistTags(pkg.name, runner);
  const latest = tags.latest || null;

  if (isPrereleaseVersion(pkg.version)) {
    if (!latest || !isPrereleaseVersion(latest)) {
      return {
        latest,
        reason: latest
          ? `latest already points to stable version ${latest}.`
          : 'latest dist-tag is not set.',
        status: 'ok',
        target: null,
      };
    }

    const stableVersion = highestStableVersion(getPublishedVersions(pkg.name, runner));
    if (stableVersion) {
      runner('npm', ['dist-tag', 'add', `${pkg.name}@${stableVersion}`, 'latest'], {
        stdio: 'inherit',
      });
      logger.log(`Moved npm latest dist-tag from ${latest} to stable ${stableVersion}.`);
      return {
        latest,
        reason: `latest pointed to prerelease ${latest}; moved it back to stable ${stableVersion}.`,
        status: 'moved',
        target: stableVersion,
      };
    }

    const reason = `latest points to prerelease ${latest}, but no stable versions are published; stable release must move latest.`;
    logger.warn(`Warning: ${reason}`);
    return {
      latest,
      reason,
      status: 'deferred',
      target: null,
    };
  }

  if (latest !== pkg.version) {
    runner('npm', ['dist-tag', 'add', `${pkg.name}@${pkg.version}`, 'latest'], {
      stdio: 'inherit',
    });
    logger.log(`Moved npm latest dist-tag from ${latest || '<unset>'} to stable ${pkg.version}.`);
    return {
      latest,
      reason: `latest pointed to ${latest || '<unset>'}; moved it to stable ${pkg.version}.`,
      status: 'moved',
      target: pkg.version,
    };
  }

  return {
    latest,
    reason: `latest already points to stable version ${pkg.version}.`,
    status: 'ok',
    target: pkg.version,
  };
}

function publishIfNeeded(options = {}) {
  const root = options.root || ROOT;
  const runner = options.execFileSync || execFileSync;
  const logger = options.logger || console;
  const pkg = readPackage(root);
  const packageSpec = `${pkg.name}@${pkg.version}`;
  validatePublishTag(pkg, options.tag);

  if (packageVersionExists(packageSpec, runner)) {
    const latestPolicy = ensureLatestTagPolicy(pkg, runner, logger);
    return {
      latestPolicy,
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

  const latestPolicy = ensureLatestTagPolicy(pkg, runner, logger);

  return {
    latestPolicy,
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
  ensureLatestTagPolicy,
  getDistTags,
  getPublishedVersions,
  highestStableVersion,
  isNpmNotFoundError,
  isPrereleaseVersion,
  isStableVersion,
  packageVersionExists,
  parseDistTagOutput,
  parseArgs,
  parseVersionsOutput,
  publishIfNeeded,
  readPackage,
  validatePublishTag,
};
