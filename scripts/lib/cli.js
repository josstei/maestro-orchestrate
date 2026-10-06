'use strict';

/**
 * Shared argv parsing and failure handling for the release scripts' CLIs.
 */

function parseFlagArgs(argv, { defaults, flags, printHelp }) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (!Object.hasOwn(flags, arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    options[flags[arg]] = argv[index + 1];
    index += 1;
  }

  return options;
}

function runCli(failurePrefix, main) {
  try {
    main();
  } catch (error) {
    console.error(`${failurePrefix}: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseFlagArgs,
  runCli,
};
