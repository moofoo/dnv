//Adapted from https://github.com/croquiscom/rinore

const { inspect } = require('util');
const fs = require('fs');
const nodeRepl = require('repl');
const envPaths = require('env-paths');

const sep = require('path').sep;

const { setupContext, loadModules } = require('./repl-require');
const {
    getMajorNodeVersion,
    replWriter,
    replLoad,
    replDisplay,
} = require('./repl-util');

const paths = envPaths('DNV');

function replaceCompleter(replServer) {
    const originalCompleter = replServer.completer;
    replServer.completer = (line, callback) => {
        const hasExtraChars = /(?:\(|\s)/.test(line);
        line = line.replace(/\(\s*$/, '').trim();
        originalCompleter(line, (error, result) => {
            if (error || !result[0]) {
                callback(error, result);
                return;
            }
            if (!result[0].some((item) => item === result[1])) {
                callback(error, result);
                return;
            }
            if (!(result[0].length === 1 || hasExtraChars)) {
                callback(error, result);
                return;
            }
            const expr = `try { ${result[1]} } catch (e) {}`;
            replServer.eval(expr, replServer.context, 'repl', (e, object) => {
                if (typeof object === 'function') {
                    const argsMatch =
                        object
                            .toString()
                            .match(/^function\s*[^(]*\(\s*([^)]*)\)/m) ||
                        object.toString().match(/^[^(]*\(\s*([^)]*)\)/m);
                    replServer.output.write('\n');
                    replServer.output.write(
                        `${result[1]}(\u001b[35m${argsMatch[1]}\u001b[39m)\n`
                    );
                    replServer._refreshLine();
                }
                callback(error, [[result[1]], result[1]]);
            });
        });
    };
}

const start = ({ input, output, service = 'service', loadDeps = [] }) => {
    const options = {
        input: input || process.stdin,
        output: output || process.stdout,
        historySize: 1000,
        terminal: true,
        useColors: true,
        writer: replWriter,
        ignoreUndefined: true,
    };

    loadDeps = loadDeps.filter((val) => val);

    if (loadDeps.length) {
        loadModules(loadDeps, options, output);
    }

    let replServer = nodeRepl.start(options);

    replLoad(replServer);
    replDisplay(replServer);

    if (getMajorNodeVersion() >= 12) {
        Function.prototype[inspect.custom] = function () {
            const argsMatch =
                this.toString().match(/^function\s*[^(]*\(\s*([^)]*)\)/m) ||
                this.toString().match(/^[^(]*\(\s*([^)]*)\)/m) ||
                this.constructor
                    .toString()
                    .match(/^function\s*[^(]*\(\s*([^)]*)\)/m) ||
                this.constructor.toString().match(/^[^(]*\(\s*([^)]*)\)/m);

            return `[Function: ${this.name}(${argsMatch[1]})]`;
        };
    } else {
        replaceCompleter(replServer);
    }

    if (!fs.existsSync(paths.log)) {
        fs.mkdirSync(paths.log, { recursive: true });
    }

    replServer.setupHistory(
        `${paths.log}${sep}.${service}_repl_hist`,
        (err) => {
            if (err) {
                console.log(err);
                return;
            }
        }
    );

    setupContext(replServer);

    return replServer;
};

module.exports = start;
