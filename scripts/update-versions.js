#!/usr/bin/env node
'use strict';

const {
  updateChangelog,
  updateReleaseInputs,
} = require('./release-version-metadata');
const { runAsMain } = require('./lib/cli');

function updateVersions(version, options = {}) {
  return updateReleaseInputs(version, options);
}

if (require.main === module) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/update-versions.js <version>');
    process.exit(1);
  }

  runAsMain(module, 'version update', () => {
    updateVersions(version);
    console.log(`Updated canonical release inputs to ${version}`);
  });
}

module.exports = {
  updateChangelog,
  updateVersions,
};
