const { config } = require('../../../lib/config');
const chalk = require('chalk');
const stripAnsi = require('strip-ansi');

const inquire = (project = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;

    let { uiScrollback } = projectConfig || defaultConfig || { uiScrollback: 1000 };

    const message = 'The amount of scrollback for individual service logs displayed in the DNV UI';

    return {
        type: 'inqinput',
        name: 'uiScrollback',
        message,
        initialValue: uiScrollback,
        default: uiScrollback,
        prefix: '',
        filter: (input) => {
            input = input.replace(chalk.green('?') + '', '');
            input = input.replace(RegExp(message, 'g'), '');
            return stripAnsi(input).trim();
        },
    };
};

module.exports = inquire;
