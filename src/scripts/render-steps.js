#!/usr/bin/env node
'use strict';

const path = require('path');
const { renderSteps, validateConfig } = require('../references/orchestration-steps-renderer');
const config = require('../references/orchestration-steps.config');

const { errors } = validateConfig(config);
if (errors.length > 0) {
  console.error('Config validation errors:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const output = renderSteps(config);
process.stdout.write(output);
