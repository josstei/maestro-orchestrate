#!/usr/bin/env node
'use strict';

const { resolveSetting } = require('../config/setting-resolver');
const { resolveProjectRoot } = require('../core/project-root-resolver');
const { fatal } = require('../core/logger');

const settingName = process.argv[2];
if (!settingName) {
  fatal('Usage: read-setting.js <SETTING_NAME>');
}

const projectRoot = resolveProjectRoot();
const resolvedValue = resolveSetting(settingName, projectRoot);

if (resolvedValue !== undefined) {
  process.stdout.write(String(resolvedValue));
}
