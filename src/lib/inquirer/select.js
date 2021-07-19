const stripAnsi = require('strip-ansi');
var chalk = require('chalk');
const ListPrompt = require('inquirer/lib/prompts/list');
const ansiEscapes = require('ansi-escapes');

class SelectPrompt extends ListPrompt {
    constructor(questions, rl, answers) {
        super(questions, rl, answers);

        if (this.opt.message === this.opt.name + ':') {
            this.opt.prefix = '';
            this.opt.message = '';
        }
        this.opt.prefix = '';

        this.screen.offset =
            this.opt.offset !== undefined ? this.opt.offset : true;
        this.screen.fullClean =
            this.opt.clear !== undefined ? this.opt.clear : true;
        this.opt.showHelp =
            this.opt.showHelp !== undefined ? this.opt.showHelp : false;
        this.opt.defaultValue = this.opt.default;
        this.opt.pageSize = 20;
    }

    getQuestion() {
        if (this.opt.message === '') {
            return '';
        }

        return super.getQuestion();
    }

    render() {
        // Render question
        if (this.isActive === false) {
            return;
        }

        var message = this.getQuestion();

        this.screen.hideCursor(true);

        if (this.firstRender) {
            if (this.opt.showHelp) {
                message += chalk.dim('(Use arrow keys)');
            }
        }

        // Render choices or answer depending on the state
        if (this.status === 'answered') {
            message += chalk.cyan(
                this.opt.choices.getChoice(this.selected).short
            );
        } else {
            var choicesStr = listRender(this.opt.choices, this.selected);
            var indexPosition = this.opt.choices.indexOf(
                this.opt.choices.getChoice(this.selected)
            );
            var realIndexPosition = this.opt.choices.reduce(function (
                acc,
                value,
                i
            ) {
                // Dont count lines past the choice we are looking at
                if (i > indexPosition) {
                    return acc;
                }
                // Add line if it's a separator
                if (value.type === 'separator') {
                    return acc + 1;
                }

                var l = value.name;
                // Non-strings take up one line
                if (typeof l !== 'string') {
                    return acc + 1;
                }

                // Calculate lines taken up by string
                l = l.split('\n');
                return acc + l.length;
            },
            0);

            message +=
                (message !== '' ? '\n' : '') +
                this.paginator.paginate(
                    choicesStr,
                    realIndexPosition,
                    this.opt.pageSize
                );
        }

        this.firstRender = false;

        this.screen.render(message);

        if (this.opt.title === 'sdfsdf') {
            const coords = this.screen.cursorPos;
            this.rl.write(ansiEscapes.cursorTo(2, 0));
            this.rl.write(ansiEscapes.eraseLine);
            this.rl.write(this.opt.title);
            if (coords) {
                this.rl.write(ansiEscapes.cursorTo(coords.cols, coords.rows));
            }
        }
    }
}

function listRender(choices, pointer) {
    var output = '';
    var separatorOffset = 0;

    choices.forEach((choice, i) => {
        if (choice.type === 'separator') {
            separatorOffset++;
            output += '  ' + choice + '\n';
            return;
        }

        if (choice.disabled) {
            separatorOffset++;
            output += '  - ' + choice.name;
            output +=
                ' (' +
                (typeof choice.disabled === 'string'
                    ? choice.disabled
                    : 'Disabled') +
                ')';
            output += '\n';
            return;
        }

        var isSelected = i - separatorOffset === pointer;
        let name = choice.name;
        if (
            (choice.focus && typeof choice.focus === 'function') ||
            (choice.blur && typeof choice.blur === 'function')
        ) {
            if (isSelected && choice.focus) {
                name = choice.focus(stripAnsi(name));
            } else if (!isSelected && choice.blur) {
                name = choice.blur(stripAnsi(name));
            }
        }

        if (choice.active === false) {
            name = chalk.grey(stripAnsi(name));
        }

        var line = (isSelected ? '>' + ' ' : '  ') + name;

        if (isSelected) {
            line = chalk.cyan(line);
        }

        output += line + ' \n';
    });

    return output.replace(/\n$/, '');
}

module.exports = SelectPrompt;
