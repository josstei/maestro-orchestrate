'use strict';

/**
 * Shared argv parsing and failure handling for the CLIs under scripts/
 * (the generator, release and installer scripts).
 */

/**
 * Parses `flags` (`--name value`) and `booleans` (switches, default false),
 * each mapping an argument to its option name, plus up to `maxPositionals`
 * bare arguments collected into `options.positionals` (`positionalName` names
 * them in the too-many error). -h/--help anywhere prints help and exits.
 */
function parseFlagArgs(argv, { defaults, flags = {}, booleans = {}, maxPositionals = 0, positionalName, printHelp }) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const options = { ...defaults };
  for (const name of Object.values(booleans)) options[name] = false;
  if (maxPositionals > 0) options.positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (Object.hasOwn(booleans, arg)) {
      options[booleans[arg]] = true;
    } else if (Object.hasOwn(flags, arg)) {
      if (index + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }

      options[flags[arg]] = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('-') || maxPositionals === 0) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (options.positionals.length === maxPositionals) {
      throw new Error(`Expected at most ${maxPositionals === 1 ? 'one' : maxPositionals} ${positionalName}`);
    } else {
      options.positionals.push(arg);
    }
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
