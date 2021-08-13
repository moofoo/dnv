let { config } = require('./lib/config');
const { files } = require('./lib/files');
const cli = require('./commands');
const first = require('./commands/config/first');

const main = async () => {
    files.emit('change');

    await config.setup();


    if (!config.dockerRunning || !config.isOnline || !config.hasNodeImage) {
        const chalk = require('chalk');
        const logSymbols = require('log-symbols');
        let msg = chalk.red('Startup Error') + ': ';

        msg += ` ${config.isOnline ? logSymbols.success : logSymbols.error
            } Online  `;

        msg += `${config.dockerRunning ? logSymbols.success : logSymbols.error
            } Docker Daemon Running  `;

        msg += `${config.hasNodeImage ? logSymbols.success : logSymbols.error
            } Node Image(s) Present`;


        console.error(msg);
        process.exit(0);
    }

    if (!config.isDefaultConfigSet()) {
        await first(true, false);
    }

    await cli();
};

module.exports = main;
