'use strict';

const CANONICAL_SIGNALS = Object.freeze([
  // a11y / accessibility
  'a11y', 'wcag', 'aria',
  // visual / design
  'visual', 'design', 'theme', 'typography', 'animation',
  // implementation
  'scaffold', 'implementation',
  // testing
  'test', 'tdd', 'validation',
  // architecture
  'architecture', 'contract',
  // security
  'security', 'auth', 'crypto',
  // performance
  'performance', 'optimization',
  // data
  'data', 'schema', 'sql',
  // mobile
  'mobile', 'native',
  // i18n
  'i18n', 'l10n',
  // observability
  'observability', 'logging', 'tracing',
  // docs
  'docs', 'tech-writing',
  // analytics
  'analytics', 'tracking',
  // compliance
  'compliance', 'gdpr', 'ccpa',
  // seo
  'seo', 'meta-tags',
  // cloud
  'cloud', 'aws', 'gcp', 'azure',
  // devops
  'devops', 'cicd', 'docker', 'k8s',
  // integration
  'integration', 'api',
  // product / release
  'product', 'requirements',
  'release', 'changelog', 'staging', 'rollout',
  // mainframe
  'mainframe', 'cobol', 'rpg',
]);

function normalizeSignal(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '-');
}

module.exports = { CANONICAL_SIGNALS, normalizeSignal };
