function replacePaths(content, runtime) {
  let result = content;
  const env = runtime.env || {};
  if (env.extensionPath) {
    result = result.replace(/\$\{extensionPath\}/g, '${' + env.extensionPath + '}');
  }
  if (env.workspacePath) {
    result = result.replace(/\$\{workspacePath\}/g, '${' + env.workspacePath + '}');
  }
  return result;
}
module.exports = replacePaths;
