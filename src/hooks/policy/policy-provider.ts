import { DENY_RULES, ASK_RULES } from '../../core/policy-rules.js';

function getCommandPolicy() {
  return {
    denyRules: DENY_RULES,
    askRules: ASK_RULES,
  };
}

export { getCommandPolicy };
