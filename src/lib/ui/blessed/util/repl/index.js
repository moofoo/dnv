const startServer = require('./repl-start');
const parseArgs = require('minimist');

const argv = parseArgs(process.argv);

const service = argv.service || 'service';
const loadDeps = argv.loadDeps || [];

startServer({ service, loadDeps });
