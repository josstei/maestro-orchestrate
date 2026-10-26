#!/usr/bin/env node
'use strict';

const { writeStateFile, stateErrorMessage } = require('./state-access');
const { readText } = require('../core/stdin-reader');
const { fatal } = require('../core/logger');

async function main() {
  let stateFile;
  let expectedSha256;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--expected-sha256') {
      const digest = args[++index];
      if (expectedSha256 !== undefined || !/^[a-f0-9]{64}$/i.test(digest || '')) {
        throw new Error('--expected-sha256 must be followed by a 64-character hexadecimal digest');
      }
      expectedSha256 = digest.toLowerCase();
    } else if (!stateFile) {
      stateFile = args[index];
    }
  }
  if (!stateFile) throw new Error('Usage: write-state.js <relative-path>');
  const content = await readText();
  if (!content) throw new Error('stdin content is empty');
  await writeStateFile(stateFile, content, process.cwd(), { expectedSha256 });
}

main().catch((err) => fatal(stateErrorMessage(err)));
