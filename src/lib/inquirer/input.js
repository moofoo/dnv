var ansiEscapes = require('ansi-escapes');
var chalk = require('chalk');
const InputPrompt = require('inquirer/lib/prompts/input');

class InqInput extends InputPrompt {
    constructor(
        questions /*: Array<any> */,
        rl /*: readline$Interface */,
        answers /*: Array<any> */
    ) {
        super(questions, rl, answers);

        this.init = true;
        this.screen.offset =
            this.opt.offset !== undefined ? this.opt.offset : true;
        this.screen.fullClean =
            this.opt.clear !== undefined ? this.opt.clear : true;
        this.opt.defaultValue = this.opt.default || this.opt.initialValue;
        this.opt.default = null;
    }

    render(error) {
        if (this.isActive === false) {
            return;
        }

        var bottomContent = '';
        var appendContent = '';
        var message = this.getQuestion();
        var transformer = this.opt.transformer;
        var isFinal = this.status === 'answered';

        if (this.init && !this.opt.initialValue) {
            this.init = false;
            this.screen.showCursor();
        }

        if (this.init && this.opt.initialValue) {
            this.init = false;
            this.screen.showCursor();
            appendContent = (message + `${this.opt.initialValue}`).trim();
            this.rl.write(ansiEscapes.eraseLine);
            this.rl.write(ansiEscapes.cursorLeft);
            this.rl.write(appendContent);

            this.render();
        } else {
            if (isFinal) {
                appendContent = this.answer;
            } else {
                appendContent = this.rl.line;
            }

            if (transformer) {
                message += transformer(appendContent, this.answers, {
                    isFinal,
                });
            } else {
                message += isFinal ? chalk.cyan(appendContent) : appendContent;
            }

            if (error) {
                bottomContent = chalk.red('>> ') + error;
            }

            this.screen.render(message, bottomContent, true);
        }
    }
}

module.exports = InqInput;
