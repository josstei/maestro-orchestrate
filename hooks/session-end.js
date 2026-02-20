#!/usr/bin/env node
'use strict';

const { defineHook, response, hookState } = require('../src/lib/maestro');

function handler(ctx) {
  hookState.removeSessionDir(ctx.sessionId);
  return response.advisory();
}

defineHook({ handler, fallbackResponse: response.advisory });

module.exports = { handler };
