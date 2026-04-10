function replaceToolNames(content, runtime) {
  let result = content;
  const tools = runtime.tools || {};
  for (const [canonical, mapped] of Object.entries(tools)) {
    if (canonical === mapped) continue;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Backtick-wrapped replacement
    const replacement = Array.isArray(mapped)
      ? mapped.map((t) => `\`${t}\``).join('/') : `\`${mapped}\``;
    result = result.replace(new RegExp('`' + esc(canonical) + '`', 'g'), replacement);
    // YAML list replacement
    const yamlPattern = new RegExp('(^\\s*- )' + esc(canonical) + '(\\s*$)', 'gm');
    if (Array.isArray(mapped)) {
      result = result.replace(yamlPattern, (match, indent) => mapped.map((t) => `${indent}${t}`).join('\n'));
    } else {
      result = result.replace(yamlPattern, `$1${mapped}$2`);
    }
  }
  return result;
}
module.exports = replaceToolNames;
