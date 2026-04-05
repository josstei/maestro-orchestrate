function skillMetadata(content, runtime) {
  if (runtime.name === 'gemini') return content;
  // Insert user-invocable: false before the closing ---
  return content.replace(
    /^(---\n[\s\S]*?)(^---)/m,
    '$1user-invocable: false\n$2'
  );
}
module.exports = skillMetadata;
