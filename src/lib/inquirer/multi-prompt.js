const inquirer = require('inquirer');
const cloneDeep = require('lodash.clonedeep');
const merge = require('lodash.merge');
const Rx = require('rxjs');
const clear = require('clear');
const cliCursor = require('cli-cursor');

class MultiPrompt {
    constructor(promptDefinitions, startPrompt, answers = {}) {
        this.promptDefs = promptDefinitions;
        this.startPrompt = startPrompt;
        this.answers = answers;
        this.opts = {};

        this.altDefs = null;
        this.setDefs = this.setDefs.bind(this);
        this.setAnswers = this.setAnswers.bind(this);
        this.getOpts = this.getOpts.bind(this);
        this.display = this.display.bind(this);
    }

    async getOpts(name, answers) {
        let section;

        if (this.promptDefs.sections[name]) {
            this.altDefs = null;
            section = cloneDeep(this.promptDefs.sections[name]);
        } else if (this.altDefs && this.altDefs.sections[name]) {
            section = cloneDeep(this.altDefs.sections[name]);
        }

        if (typeof section.prompt === 'function') {
            section.prompt = await section.prompt(
                answers,
                this.setDefs,
                this.setAnswers
            );
        }

        section.prompt = cloneDeep(section.prompt);

        section.prompt.askAnswered = true;

        return section;
    }

    setDefs(defs, nextOpts) {
        this.altDefs = cloneDeep(defs); // merge({}, this.promptDefs, defs);
        this.nextOpts = nextOpts;
    }

    setAnswers(answers = {}) {
        Object.keys(answers).forEach((key) => {
            if (answers[key] !== 'return' && answers[key] !== undefined) {
                this.answers[key] = answers[key];
            }
        });
    }

    display() {
        return new Promise(
            async function (resolve) {
                const prompts = new Rx.Subject();

                this.opts = await this.getOpts(this.startPrompt);

                let gotoSection = null;

                const ui = inquirer.prompt(prompts).ui;

                process.stdin.on('keypress', async (ch, key) => {
                    if (key.name === 'escape') {
                        if (!this.opts.backSection) {
                            gotoSection = 'cancelled';
                            prompts.complete();
                            resolve('cancelled');
                        }

                        let section;
                        if (typeof this.opts.backSection === 'function') {
                            section = await this.opts.backSection(
                                this.answers,
                                this.setDefs
                            );
                        } else {
                            section = this.opts.backSection;
                        }

                        gotoSection = section;

                        ui.activePrompt.answer = '';
                        ui.activePrompt.done('');
                    }
                });

                let onSubmit = null;

                ui.process.subscribe(async ({ name, answer }) => {
                    if (this.opts.prompt.submitted && answer === true) {
                        await this.opts.prompt.submitted();
                    }

                    if (this.nextOpts) {
                        this.opts = await this.getOpts(
                            this.nextOpts,
                            this.answers
                        );
                        this.nextOpts = null;
                    }

                    if (
                        answer === 'cancel_and_close' ||
                        gotoSection === 'cancelled'
                    ) {
                        prompts.complete();
                        resolve('cancelled');
                    } else if (answer === 'save_and_exit') {
                        prompts.complete();
                        resolve(this.answers);
                    } else {
                        if (!gotoSection && answer !== 'return') {
                            this.answers[name] = answer;
                        }

                        let section;

                        if (gotoSection) {
                            section = gotoSection;
                            gotoSection = null;
                        } else if (
                            typeof this.opts.nextSection === 'function'
                        ) {
                            section = await this.opts.nextSection(this.answers);
                        } else {
                            section = this.opts.nextSection;
                        }

                        this.opts = await this.getOpts(section, this.answers);

                        if (this.opts.prompt.onSubmit) {
                            onSubmit = this.opts.prompt.onSubmit;
                        }

                        prompts.next(this.opts.prompt);

                        if (
                            this.opts.prompt.type &&
                            !this.opts.prompt.type.includes('input')
                        ) {
                            cliCursor.hide();
                        }
                    }
                });

                prompts.next(this.opts.prompt);
            }.bind(this)
        );
    }
}

module.exports = {
    MultiPrompt,
};
