#!/usr/bin/env node
import { updateChangelog, updateReleaseInputs } from './release-version-metadata.js';
import { runAsMain } from './lib/cli.js';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function updateVersions(version, options = {}) {
  return updateReleaseInputs(version, options);
}

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/update-versions.js <version>');
    process.exit(1);
  }

  runAsMain(import.meta.url, 'version update', () => {
    updateVersions(version);
    console.log(`Updated canonical release inputs to ${version}`);
  });
}

export { updateChangelog, updateVersions };
