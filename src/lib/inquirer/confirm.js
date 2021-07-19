const ConfirmPrompt = require('inquirer/lib/prompts/confirm');

class Confirm extends ConfirmPrompt {
    constructor(questions, rl, answers) {
        super(questions, rl, answers);
        this.init = true;
        this.screen.offset =
            this.opt.offset !== undefined ? this.opt.offset : true;
        this.screen.fullClean =
            this.opt.clear !== undefined ? this.opt.clear : true;
    }

    onEnd(input) {
        this.isActive = false;
        super.onEnd(input);
        this.rl.output.write('\x1b[1 q');
    }

    render(error) {
        if (this.isActive === false) {
            return this;
        }

        if (this.init) {
            this.rl.output.write('\x1b[3 q');
            this.init = false;
        }

        return super.render(error);
    }
}

module.exports = Confirm;
``;
