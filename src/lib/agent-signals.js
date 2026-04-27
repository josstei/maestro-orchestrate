'use strict';

const CANONICAL_SIGNALS = Object.freeze([
  'a11y', 'wcag', 'aria',

  'visual', 'design', 'theme', 'typography', 'animation',

  'scaffold', 'implementation',

  'test', 'tdd', 'validation',

  'architecture', 'contract',

  'security', 'auth', 'crypto',

  'performance', 'optimization',

  'data', 'schema', 'sql',

  'mobile', 'native',

  'i18n', 'l10n',

  'observability', 'logging', 'tracing',

  'docs', 'tech-writing',

  'analytics', 'tracking',

  'compliance', 'gdpr', 'ccpa',

  'seo', 'meta-tags',

  'cloud', 'aws', 'gcp', 'azure',

  'devops', 'cicd', 'docker', 'k8s',

  'integration', 'api',

  'product', 'requirements',
  'release', 'changelog', 'staging', 'rollout',

  'mainframe', 'cobol', 'rpg',
]);

function normalizeSignal(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '-');
}

module.exports = { CANONICAL_SIGNALS, normalizeSignal };
