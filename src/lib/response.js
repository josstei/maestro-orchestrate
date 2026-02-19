'use strict';

function allow() {
  return JSON.stringify({ decision: 'allow' });
}

function deny(reason) {
  return JSON.stringify({ decision: 'deny', reason });
}

function allowWithContext(context, hookEventName = 'BeforeAgent') {
  return JSON.stringify({
    decision: 'allow',
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context,
    },
  });
}

function advisory() {
  return '{}';
}

module.exports = { allow, deny, allowWithContext, advisory };
