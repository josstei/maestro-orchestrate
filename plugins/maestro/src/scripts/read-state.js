#!/usr/bin/env node
'use strict';

const { readStateFile, stateErrorMessage } = require('./state-access');
const { fatal } = require('../core/logger');

async function main() {
  const args = process.argv.slice(2);
  const withDigest = args.includes('--with-digest');
  const paths = args.filter((arg) => arg !== '--with-digest');
  const stateFile = paths[0];
  if (!stateFile) throw new Error('Usage: read-state.js <relative-path>');
  const content = await readStateFile(stateFile, process.cwd(), { withDigest });
  process.stdout.write(content);
}

main().catch((err) => fatal(stateErrorMessage(err)));
