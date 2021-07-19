const { title2 } = require('../text');

const PROMPT_SCREEN = 'promptScreen';

class SuperList {
    constructor({
        key = '',
        title = 'User List',
        sectionTitle = '',
        chooseKeyPrompt = {},
        promptScreenPrompt = {},
    }) {
        this.key = key;
        this.title = title;
        this.sectionTitle = sectionTitle;
        this.chooseKeyPrompt = chooseKeyPrompt || {};
        this.promptScreenPrompt = promptScreenPrompt || {};

        this.init = true;
    }

    display(answers, setDefs, setAnswers) {
        const configApp = {
            sections: {
                chooseKeyScreen: {
                    backSection: 'settings',
                    nextSection: (answers) => {
                        const { objectKey } = answers;
                        this.objectKey = objectKey;
                        return PROMPT_SCREEN;
                    },
                    name: 'chooseKeyScreen',
                    prompt: () => {
                        this.objectKey = null;

                        if (this.sectionTitle) {
                            title2(this.sectionTitle, true);
                        }

                        let prompt;

                        if (typeof this.chooseKeyPrompt === 'function') {
                            prompt = this.chooseKeyPrompt();
                        } else {
                            prompt = this.chooseKeyPrompt;
                        }

                        this.promptKey = prompt.name;

                        return {
                            askAnswered: true,
                            ...prompt,
                        };
                    },
                },

                promptScreen: {
                    name: 'promptScreen',
                    backSection: 'settings',
                    nextSection: (answers) => {
                        const { [this.key]: answer } = answers;

                        if (answer !== 'return') {
                            setAnswers({
                                [this.key]: {
                                    [this.objectKey]: answer,
                                },
                            });
                        }

                        return 'settings';
                    },

                    prompt: () => {
                        if (this.sectionTitle) {
                            title2(this.sectionTitle, true);
                        }

                        let prompt;

                        if (typeof this.promptScreenPrompt === 'function') {
                            prompt = this.promptScreenPrompt(this.objectKey);
                        } else {
                            prompt = this.promptScreenPrompt;
                        }

                        return {
                            askAnswered: true,
                            ...prompt,
                        };
                    },
                },
            },
        };

        setDefs(configApp, 'chooseKeyScreen');

        return configApp.sections.chooseKeyScreen.prompt(answers);
    }
}

module.exports = SuperList;
