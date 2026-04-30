#!/usr/bin/env node
'use strict';

const {
  updateChangelog,
  updateReleaseInputs,
} = require('./release-version-metadata');

function updateVersions(version, options = {}) {
  return updateReleaseInputs(version, options);
}

if (require.main === module) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/update-versions.js <version>');
    process.exit(1);
  }

  try {
    updateVersions(version);
    console.log(`Updated canonical release inputs to ${version}`);
  } catch (error) {
    console.error(`version update failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  updateChangelog,
  updateVersions,
};
