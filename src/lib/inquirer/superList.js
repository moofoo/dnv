const inquirer = require('inquirer');
const stripAnsi = require('strip-ansi');
const cliCursor = require('cli-cursor');
const chalk = require('chalk');
const { title2 } = require('../text');

const ADD_MODIFY_SCREEN = 'addModifyScreen';
const EDIT_DELETE_SCREEN = 'editDeleteScreen';
const ADD_SCREEN = 'addScreen';
const EDIT_SCREEN = 'editScreen';

class SuperList {
    constructor({
        key = '',
        title = 'User List',
        sectionTitle = '',
        currentItemsMessage = 'Current Items',
        addOrModifyMessage = 'Select an item to modify, or add a new item',
        enableDisableMessage = 'Enable or Disable items (toggle state)',
        editOrDeleteMessage = 'Edit or delete the selected item.',
        addMessage = 'Add pattern',
        editMessage = 'Edit pattern',
        deleteMessage = 'Delete pattern',
        alt = {},
        defaults = [],
        disable = [],
    }) {
        this.key = key;
        this.title = title;
        this.sectionTitle = sectionTitle;
        this.currentItemsMessage = currentItemsMessage || 'Current items';
        this.addOrModifyMessage = addOrModifyMessage || 'Add / Modify items';
        this.enableDisableMessage =
            enableDisableMessage || 'Enable / Disable items';
        this.editOrDeleteMessage = editOrDeleteMessage || 'Edit / Delete items';
        this.addMessage = addMessage;

        this.editMessage = editMessage;
        this.deleteMessage = deleteMessage;
        this.defaults = [...defaults] || [];
        this.startingDefaults = [...this.defaults];
        this.default = null;
        this.disable = disable || [];

        this.alt = alt;

        this.defaultsMap = this.defaults.reduce((acc, curr) => {
            return {
                [curr.value]: curr,
                ...acc,
            };
        }, {});

        this.init = true;
    }

    addModifyChoices() {
        return this.defaults.map((def) => {
            return {
                name: this.alt[def.value] ? this.alt[def.value] : def.value,
                value: def.value,
                active: def.enabled,
            };
        });
    }

    display(answers, setDefs, setAnswers) {
        const configApp = {
            sections: {
                addModifyScreen: {
                    backSection: 'settings',
                    nextSection: (answers) => {
                        const { addOrModify } = answers;

                        if (addOrModify === 'add') {
                            return ADD_SCREEN;
                        } else if (addOrModify === 'save') {
                            setAnswers({ [this.key]: this.defaults });

                            return 'settings';
                        } else if (addOrModify === 'cancel') {
                            return 'settings';
                        } else {
                            this.chosenItem = addOrModify;
                            return EDIT_DELETE_SCREEN;
                        }
                    },
                    name: 'addModifyScreen',
                    prompt: (answers) => {
                        this.chosenItem = null;

                        let choices = [
                            ...this.addModifyChoices(),
                            new inquirer.Separator(),
                            {
                                name: chalk.green(this.addMessage),
                                value: 'add',
                                focus: chalk.greenBright.underline,
                                blur: chalk.green,
                            },
                            {
                                name: chalk.blueBright('Save'),
                                value: 'save',
                                focus: chalk.cyanBright.underline,
                                blur: chalk.blueBright,
                            },

                            {
                                name: chalk.red('Cancel'),
                                value: 'cancel',
                                focus: chalk.redBright.underline,
                                blur: chalk.red,
                            },
                        ];

                        if (this.disable.length) {
                            choices = choices.map((choice) => {
                                if (
                                    this.disable.includes(
                                        typeof choice === 'string'
                                            ? choice
                                            : choice.value
                                    )
                                ) {
                                    if (typeof choice === 'string') {
                                        choice = {
                                            name: choice,
                                            value: choice,
                                            disabled: 'required',
                                        };
                                    } else {
                                        choice = {
                                            ...choice,
                                            disabled: 'required',
                                        };
                                    }
                                }

                                return choice;
                            });
                        }

                        if (this.sectionTitle) {
                            title2(this.sectionTitle, true);
                        }

                        process.nextTick(() => {
                            cliCursor.hide();
                        });

                        return {
                            message: this.title,
                            askAnswered: true,
                            pageSize: 15,
                            type: 'inqselect',
                            name: 'addOrModify',
                            choices,
                            default: this.default,
                        };
                    },
                },

                addScreen: {
                    name: 'addScreen',
                    backSection: 'addModifyScreen',
                    nextSection: (answers) => {
                        const { newItem } = answers;

                        if (newItem !== '') {
                            this.default = newItem;
                            this.defaults.push({
                                value: newItem,
                                enabled: true,
                            });

                            this.defaultsMap[newItem] = {
                                value: newItem,
                                enabled: true,
                            };
                        }
                        return ADD_MODIFY_SCREEN;
                    },
                    prompt: (answers, opts) => {
                        if (this.sectionTitle) {
                            title2(this.sectionTitle, true);
                        }

                        return {
                            askAnswered: true,
                            type: 'inqinput',
                            message: this.addMessage,
                            name: 'newItem',
                            filter: (input) => {
                                input = input.replace(
                                    chalk.green('?') + '',
                                    ''
                                );
                                input = input.replace(
                                    RegExp(this.addMessage, 'g'),
                                    ''
                                );
                                return stripAnsi(input);
                            },
                        };
                    },
                },
                editDeleteScreen: {
                    name: 'editDeleteScreen',
                    backSection: 'addModifyScreen',
                    nextSection: (answers) => {
                        const { editOrDelete } = answers;
                        let section = ADD_MODIFY_SCREEN;

                        if (editOrDelete === 'edit_cancel') {
                            this.default = this.chosenItem;
                        } else if (editOrDelete === 'delete') {
                            this.defaults = this.defaults.filter((def) => {
                                return def.value !== this.chosenItem;
                            });
                            this.default = null;
                        } else if (editOrDelete === 'disable') {
                            this.defaults = this.defaults.map((def, index) => {
                                if (def.value === this.chosenItem) {
                                    this.defaultsMap[
                                        this.chosenItem
                                    ].enabled = false;

                                    def.enabled = false;

                                    return def;
                                }

                                return def;
                            });

                            this.default = this.chosenItem;
                        } else if (editOrDelete === 'enable') {
                            this.defaults = this.defaults.map((def, index) => {
                                if (def.value === this.chosenItem) {
                                    this.defaultsMap[
                                        this.chosenItem
                                    ].enabled = true;

                                    def.enabled = true;

                                    return def;
                                }

                                return def;
                            });

                            this.default = this.chosenItem;
                        } else {
                            section = EDIT_SCREEN;
                        }
                        return section;
                    },
                    prompt: () => {
                        const chosenItem = this.chosenItem;

                        if (this.sectionTitle) {
                            title2(this.sectionTitle, true);
                        }

                        process.nextTick(() => {
                            cliCursor.hide();
                        });

                        return {
                            message: this.title,
                            askAnswered: true,
                            type: 'inqselect',
                            name: 'editOrDelete',
                            choices: [
                                {
                                    value: 'edit',
                                    name: `Edit '${chosenItem}'`,
                                },
                                {
                                    value: 'delete',
                                    name: `Delete '${chosenItem}' from list`,
                                },

                                {
                                    value:
                                        this.defaultsMap[chosenItem] &&
                                        this.defaultsMap[chosenItem].enabled
                                            ? 'disable'
                                            : 'enable',
                                    name:
                                        this.defaultsMap[chosenItem] &&
                                        this.defaultsMap[chosenItem].enabled
                                            ? `Disable ${chosenItem}`
                                            : `Enable ${chosenItem}`,
                                },
                                {
                                    value: 'edit_cancel',
                                    name: 'Cancel',
                                },
                            ],
                            default: 'edit',
                        };
                    },
                },
                editScreen: {
                    name: 'edit screen',
                    backSection: 'editDeleteScreen',
                    nextSection: (answers) => {
                        const { editedItem } = answers;

                        this.default = editedItem;

                        this.defaults = this.defaults.map((def, index) => {
                            if (def.value === this.chosenItem) {
                                this.defaultsMap[this.chosenItem].value =
                                    editedItem;

                                def.value = editedItem;

                                return def;
                            }

                            return def;
                        });

                        return ADD_MODIFY_SCREEN;
                    },
                    prompt: (answers, opts) => {
                        if (this.sectionTitle) {
                            title2(this.sectionTitle, true);
                        }

                        return {
                            initialValue: this.chosenItem,
                            type: 'inqinput',
                            message: this.editMessage,
                            prefix: '',
                            name: 'editedItem',
                            filter: (input) => {
                                input = input.replace(
                                    chalk.green('?') + '',
                                    ''
                                );
                                input = input.replace(
                                    RegExp(this.editMessage, 'g'),
                                    ''
                                );
                                return stripAnsi(input).trim();
                            },
                        };
                    },
                },
            },
        };

        setDefs(configApp, 'addModifyScreen');

        return configApp.sections.addModifyScreen.prompt(answers);
    }
}

module.exports = SuperList;
