const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
let { config } = require('./lib/config');
const { files } = require('./lib/files');
const cli = require('./commands');
const parseArgs = require('minimist');
const first = require('./commands/config/first');

const argv = parseArgs(process.argv);

const main = async () => {
    let projectinfo = argv.projectinfo;
    let defaultConfig = argv.defaultConfig;
    let info = argv.testinfo;
    let reset = argv.testreset;
    let cwd = argv.cwd;

    if (cwd) {
        process.chdir(cwd);
        files.cwd = cwd;
        files.emit('change');
    }

    if (defaultConfig) {
        console.log(JSON.stringify(config.get('defaultConfig')));
        return;
    }

    if (projectinfo) {
        const project = config.getProjectConfig();

        if (project) {
            console.log(JSON.stringify(project));
            return;
        }

        const configs = config.getAllProjectConfigs();

        if (configs) {
            const base = path.basename(cwd);
            for (const opts of Object.values(configs)) {
                if (opts.path.includes(base)) {
                    console.log(JSON.stringify(opts));
                    break;
                }
            }
        }

        return;
    }

    if (info) {
        console.log(JSON.stringify(config.store));

        if (!reset) {
            return;
        }
    }

    if (reset) {
        const configPath = config.path;
        config = null;
        if (fs.existsSync(configPath)) {
            rimraf.sync(
                configPath.replace('/' + path.basename(configPath), '')
            );
        }
        return;
    }

    await config.setup();

    if (!config.dockerRunning || !config.isOnline) {
        const chalk = require('chalk');
        const logSymbols = require('log-symbols');
        let msg = chalk.red('Startup Error') + ': ';

        msg += `${
            config.dockerRunning ? logSymbols.success : logSymbols.error
        } Docker Daemon Running`;
        msg += ` ${
            config.isOnline ? logSymbols.success : logSymbols.error
        } Online`;

        console.error(msg);
        return;
    }

    if (!config.isDefaultConfigSet()) {
        await first(true, false);
    }

    process.argv = process.argv.filter((arg) => {
        return !arg.includes('--cwd') && !arg.includes('--projectName');
    });

    await cli();
};

module.exports = main;
