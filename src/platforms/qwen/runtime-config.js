const { buildGeminiFamilyConfig } = require('../shared/gemini-family-config');

module.exports = buildGeminiFamilyConfig({
  name: 'qwen',
  outputDir: 'qwen/',
  env: { extensionPath: 'extensionPath', workspacePath: 'workspacePath' },
  tools: {
    google_web_search: 'web_search',
    replace: 'edit',
    ask_user: 'ask_user_question',
    read_many_files: 'read_many_files',
    write_todos: 'todo_write',
    activate_skill: 'skill',
  },
});
