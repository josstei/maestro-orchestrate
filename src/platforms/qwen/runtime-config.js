'use strict';

const gemini = require('../gemini/runtime-config');

module.exports = {
  ...gemini,
  name: 'qwen',
  outputDir: 'qwen/',

  env: {
    extensionPath: 'extensionPath',
    workspacePath: 'workspacePath',
  },

  tools: {
    ...gemini.tools,
    google_web_search: 'web_search',
    replace: 'edit',
    ask_user: 'ask_user_question',
    read_many_files: 'read_many_files',
    write_todos: 'todo_write',
    activate_skill: 'skill',
  },
};
