const parseArgs = require('minimist');

const argv = parseArgs(process.argv);

const main = async () => {
    let command;

    if (argv._.includes('init')) {
        command = 'init';
    } else if (argv._.includes('config')) {
        command = 'config';
    } else if (argv._.includes('info')) {
        command = 'info';
    } else if (argv._.includes('clear')) {
        command = 'clear';
    } else if (argv._.includes('up')) {
        command = 'up';
    } else if (argv._.includes('ui')) {
        command = 'ui';
    } else if (argv._.includes('stop')) {
        command = 'stop';
    }

    if (!command) {
        process.stdout.write(String.raw`
    Usage
        $ dnv <command>

    Commands
        clear -- Remove containers, volumes, images and clear configuration for DNV projects
        config -- Modify project / default configuration
        info -- Display project configuration
        init -- Initialize project in current directory
        ui -- Start project using DNVs Multiplexing UI
        up -- Start project using 'docker-compose up'
        stop -- Run docker-compose stop for DNV projects

    Example
        $ dnv init (initialize DNV project in current directory)
        $ dnv config (edit configuration of project in current directory)
        $ dnv up -h (show help for 'up' command)
        $ dnv ui (Run DNV UI for project in current directory)
`);
        return;
    }

    if (command === 'init') {
        const init = require('./init');
        await init();
    }

    if (command == 'config') {
        const config = require('./config');
        await config();
    }

    if (command == 'info') {
        const info = require('./info');
        await info();
    }

    if (command == 'clear') {
        const clear = require('./clear');
        await clear();
    }

    if (command == 'up') {
        const up = require('./up');
        await up();
    }

    if (command == 'ui') {
        const ui = require('./ui');
        await ui();
    }

    if (command == 'stop') {
        const stop = require('./stop');
        await stop();
    }
};

module.exports = main;
