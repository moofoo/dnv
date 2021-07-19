const chalk = require('chalk');
const logSymbols = require('log-symbols');
const clear = require('clear');

const ansiEscapes = require('ansi-escapes');
const title = chalk.bold.underline.yellowBright;

const title2 = (msg, reset) => {
    if (reset) {
        process.stdout.write(ansiEscapes.clearTerminal);
    }

    console.log(chalk.bold.underline.yellow(msg));
};

const subTitle = (msg) => {
    console.log(chalk.underline.cyan(msg));
};

const error = (msg, log = true) => {
    const txt = `${chalk.bold.red('Error: ')} ${msg}`;

    if (log) {
        console.error(txt);
    } else {
        return txt;
    }
};

const success = (msg, reset = false) => {
    if (reset) {
        clear();
        process.stdout.write(ansiEscapes.cursorTo(0, 0));
    }

    console.log(`${logSymbols.success} ${chalk.cyanBright(msg)}`);
};

const info = (msg) => {
    console.log(`${chalk.bold(logSymbols.info)} ${chalk.yellowBright(msg)}`);
};

const warning = (msg) => {
    console.log(`${chalk.bold(logSymbols.warning)} ${chalk.blueBright(msg)}`);
};

module.exports = {
    title,
    title2,
    error,
    success,
    info,
    subTitle,
    warning,
};
