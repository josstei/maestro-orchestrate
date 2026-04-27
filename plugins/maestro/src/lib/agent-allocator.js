'use strict';

const { normalizeSignal } = require('./agent-signals');

const MINIMUM_MATCH_SCORE = 2;
const FALLBACK_AGENT = 'coder';

const KEYWORD_TO_SIGNAL = Object.freeze({
  contrast: 'a11y', wcag: 'wcag', 'screen reader': 'a11y',
  aria: 'aria', accessibility: 'a11y', keyboard: 'a11y',
  animation: 'animation', 'design tokens': 'design', typography: 'typography',
  theme: 'theme', visual: 'visual', layout: 'design', responsive: 'design',
  scaffold: 'scaffold', implement: 'implementation', build: 'implementation',
  'unit test': 'test', 'integration test': 'test', tdd: 'tdd',
  coverage: 'test', validation: 'validation',
  architecture: 'architecture', contract: 'contract', interface: 'contract',
  auth: 'auth', authentication: 'auth', authorization: 'auth',
  crypto: 'crypto', encryption: 'crypto', vulnerability: 'security',
  performance: 'performance', latency: 'performance', optimize: 'optimization',
  throughput: 'performance', cache: 'performance',
  schema: 'schema', migration: 'data', sql: 'sql', database: 'data',
  ios: 'mobile', android: 'mobile', mobile: 'mobile',
  i18n: 'i18n', l10n: 'l10n', locale: 'i18n', translation: 'i18n',
  logging: 'logging', tracing: 'tracing', metrics: 'observability',
  documentation: 'docs', readme: 'docs',
  analytics: 'analytics', tracking: 'tracking',
  gdpr: 'gdpr', ccpa: 'ccpa', compliance: 'compliance',
  seo: 'seo', 'meta tag': 'meta-tags',
  docker: 'docker', kubernetes: 'k8s', terraform: 'cloud',
  pipeline: 'cicd', deploy: 'devops',
  webhook: 'integration', etl: 'integration', api: 'api',
  release: 'release', changelog: 'changelog', rollout: 'rollout',
  mainframe: 'mainframe', cobol: 'cobol', hlasm: 'mainframe', assembler: 'mainframe',
  'z/os': 'mainframe', zos: 'mainframe', rpg: 'rpg', 'as/400': 'mainframe',
  aws: 'aws', gcp: 'gcp', azure: 'azure',
  product: 'product', requirements: 'requirements',
  staging: 'staging',
  'react native': 'native', 'cross-platform': 'native',
});

class AgentAllocator {
  constructor(roster) {
    this.roster = roster;
  }

  allocate(phaseDeliverableText) {
    const wanted = this._extractSignals(phaseDeliverableText);
    let best = null;
    let bestScore = 0;

    for (const agent of this.roster) {
      const agentSignals = new Set((agent.frontmatter.signals || []).map(normalizeSignal));
      const score = wanted.filter((s) => agentSignals.has(s)).length;

      if (score >= MINIMUM_MATCH_SCORE && score > bestScore) {
        bestScore = score;
        best = agent;
      }
    }

    return {
      agent: best ? best.name : FALLBACK_AGENT,
      score: bestScore,
      matched_signals: wanted,
      fell_back: best === null,
    };
  }

  _extractSignals(text) {
    const lower = String(text).toLowerCase();
    const signals = [];
    for (const [kw, sig] of Object.entries(KEYWORD_TO_SIGNAL)) {
      if (lower.includes(kw)) signals.push(sig);
    }
    return [...new Set(signals)];
  }
}

module.exports = { AgentAllocator, MINIMUM_MATCH_SCORE, FALLBACK_AGENT };
