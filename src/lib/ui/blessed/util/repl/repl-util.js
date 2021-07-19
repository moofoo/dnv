const fs = require('fs');
const util = require('util');
const beautify = require('js-beautify').js;
const cardinal = require('cardinal');
const cardinalTheme = require('./cardinal-theme');

function replWriter(output) {
    let highlighted = output;

    if (typeof output === 'object') {
        highlighted = util.inspect(output, {
            showHidden: true,
            depth: 5,
            color: false,
            compact: true,
            sorted: true,
        });
    } else {
        highlighted = '' + highlighted + '';
    }

    try {
        highlighted = beautify(highlighted, {
            indent_size: 4,
            space_in_empty_paren: true,
            break_chained_methods: true,
        });
    } catch (err) {}

    try {
        highlighted = cardinal.highlight(highlighted, { theme: cardinalTheme });
    } catch (err) {}

    return highlighted;
}

function replLoad(replServer) {
    replServer.defineCommand('load', {
        help: 'Load and execute JS file in the REPL session',
        action: function (file) {
            try {
                const stats = fs.statSync(file);
                if (stats && stats.isFile()) {
                    const data = fs.readFileSync(file, 'utf8');
                    console.log(replWriter(data) + '\n');
                    this.eval(data, this.context, file, () => {});
                } else {
                    this.output.write(`Failed to load: ${file} is not a valid file\n`);
                }
            } catch {
                this.output.write(`Failed to load: ${file}\n`);
            }
            this.displayPrompt();
        },
    });
}

function replDisplay(replServer) {
    replServer.defineCommand('display', {
        help: 'Display JS File, but do not execute',
        action: function (file) {
            try {
                const stats = fs.statSync(file);
                if (stats && stats.isFile()) {
                    const data = fs.readFileSync(file, 'utf8');
                    console.log(replWriter(data));
                } else {
                    this.output.write(`Failed to load: ${file} is not a valid file\n`);
                }
            } catch {
                this.output.write(`Failed to load: ${file}\n`);
            }
            this.displayPrompt();
        },
    });
}

const getProjectPath = () => {
    return __dirname.substr(0, __dirname.indexOf('/node_modules'));
};

const getDevDeps = () => {
    let pkg = JSON.parse(fs.readFileSync(`${getProjectPath()}/package.json`));

    return Object.keys(pkg.devDependencies);
};

function getMajorNodeVersion() {
    const match = /^v(\d{1,2})\./.exec(process.version);
    if (match && match[1]) {
        return parseInt(match[1]);
    }
    return 0;
}

module.exports = {
    replDisplay,
    replLoad,
    replWriter,
    getProjectPath,
    getDevDeps,
    getMajorNodeVersion,
};
