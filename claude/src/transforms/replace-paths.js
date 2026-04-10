const path = require('node:path');

function relativeRuntimeRoot(outputPath, outputDir) {
  if (!outputPath || !outputDir) return '.';

  const normalizedOutputDir = outputDir.replace(/\/+$/, '');
  const currentDir = path.posix.dirname(outputPath);
  const relativePath = path.posix.relative(currentDir, normalizedOutputDir);
  return relativePath || '.';
}

function replacePaths(content, runtime, context = {}) {
  let result = content;
  const env = runtime.env || {};
  let extensionPath = env.extensionPath;

  if (runtime.relativeExtensionPath) {
    extensionPath = relativeRuntimeRoot(context.outputPath, runtime.outputDir);
  }

  if (extensionPath) {
    const replacement = runtime.relativeExtensionPath
      ? extensionPath
      : extensionPath.startsWith('${')
        ? extensionPath
        : '${' + extensionPath + '}';
    result = result.replace(/\$\{extensionPath\}/g, replacement);
  }
  if (env.workspacePath) {
    result = result.replace(/\$\{workspacePath\}/g, '${' + env.workspacePath + '}');
  }
  return result;
}
module.exports = replacePaths;
