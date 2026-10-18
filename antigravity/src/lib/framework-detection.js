'use strict';

const CONFIG_FILES = [
  '.eslintrc',
  '.prettierrc',
  'tsconfig.json',
  'webpack.config.js',
  'vite.config.js',
  'next.config.js',
  '.env',
  'docker-compose.yml',
  'Dockerfile',
  'Makefile',
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  'target',
  'vendor',
  '.cache',
  '.output',
  'coverage',
  '.nyc_output',
  '.pytest_cache',
]);

const FRAMEWORK_INDICATORS = {
  react: ['react', 'react-dom'],
  vue: ['vue'],
  angular: ['@angular/core'],
  next: ['next'],
  express: ['express'],
  fastify: ['fastify'],
  django: ['django'],
  flask: ['flask'],
  rails: ['rails'],
};

module.exports = {
  CONFIG_FILES,
  SKIP_DIRS,
  FRAMEWORK_INDICATORS,
};
