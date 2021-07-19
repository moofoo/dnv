const CheckboxPrompt = require('inquirer/lib/prompts/checkbox');

class InqCheckbox extends CheckboxPrompt {
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
        this.opt.defaultValue = this.opt.default;
    }
    onEnd(state) {
        this.isActive = false;
        super.onEnd(state);
    }

    render(error) {
        if (
            this.isActive === false ||
            !this.opt.choices ||
            (this.opt.choices && this.opt.choices.length === 0)
        ) {
            return this;
        }

        return super.render(error);
    }
    /*

    run() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve.bind(this);
            this.reject = reject.bind(this);

            this._run(
                (value) => this.resolve(value),
                (error) => this.reject(error)
            );
        });
    }*/
}

module.exports = InqCheckbox;
