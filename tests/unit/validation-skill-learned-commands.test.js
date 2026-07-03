'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(
  __dirname,
  '../../src/skills/shared/validation/SKILL.md'
);

test('validation skill consults get_project_profile before the heuristic tables', () => {
  const body = fs.readFileSync(SKILL, 'utf8');
  assert.ok(
    body.includes('get_project_profile'),
    'validation skill must reference get_project_profile'
  );
  const profileIdx = body.indexOf('get_project_profile');
  const buildStepIdx = body.indexOf('### Step 1: Build / Compile');
  assert.ok(buildStepIdx >= 0, 'validation skill must retain the Build/Compile heuristic step');
  assert.ok(
    profileIdx < buildStepIdx,
    'get_project_profile consultation must precede the heuristic tables'
  );
});
