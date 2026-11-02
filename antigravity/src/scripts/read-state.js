#!/usr/bin/env node
'use strict';

const { readStateFile, runStateCommand } = require('./state-access');

runStateCommand(async () => {
  const args = process.argv.slice(2);
  const withDigest = args.includes('--with-digest');
  const stateFile = args.find((arg) => arg !== '--with-digest');
  if (!stateFile) throw new Error('Usage: read-state.js <relative-path>');
  const content = await readStateFile(stateFile, process.cwd(), { withDigest });
  process.stdout.write(content);
});
