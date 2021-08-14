const inquirer = require('../../lib/inquirer/patch');
const ansiEscapes = require('ansi-escapes');

const cloneDeep = require('lodash.clonedeep');
const { config } = require('../../lib/config');
const { files } = require('../../lib/files');
const project = require('./prompts/project');
const { title2, success, error } = require('../../lib/text');
const { MultiPrompt } = require('../../lib/inquirer/multi-prompt');
const chalk = require('chalk');
const docker = require('./docker');
const npmNode = require('./npmNode');
const ui = require('./ui');
const { pickAnswers } = require('./keys');

const DnvComposeFile = require('../../lib/file-gen/dnv-compose-file');

const configAction = async (opts = {}) => {
    process.stdout.write(ansiEscapes.clearTerminal);

    const projectConfigs = config.get('projectConfigs');
    const projectOpts = !opts.default;
    const defaultConfig = config.get('defaultConfig');
    let selectedProject = {};

    if (!projectConfigs && projectOpts) {
        error(
            'Cannot enter project config - no projects have been initialized yet'
        );
        return;
    }

    if (projectOpts) {
        const isSet = config.isProjectConfigSet();
        if (isSet) {
            selectedProject = config.getProjectConfig(false);
        }

        if (!isSet || opts.select) {
            selectedProject = await project();
            files.cwd = (selectedProject && selectedProject.path) || files.cwd;
        }
    }

    const categorySettingsAndPrompts = {
        docker: await docker(projectOpts, selectedProject.dir),
        npmNode: npmNode(projectOpts, selectedProject.dir),
        ui: await ui(projectOpts, selectedProject.dir),
    };

    // title2(`${projectOpts ? selectedProject.dir : 'Default'} Configuration`, true);

    let count = 0;

    let currentTitle = '';

    const configApp = {
        sections: {
            category: {
                name: 'category',
                nextSection: 'settings',

                prompt: function () {
                    const theTitle = `${projectOpts ? selectedProject.dir : 'Default'
                        } Configuration`;

                    if (currentTitle !== theTitle) {
                        currentTitle = theTitle;
                        title2(
                            `${projectOpts ? selectedProject.dir : 'Default'
                            } Configuration`,
                            true
                        );
                    }

                    return {
                        hideOnDone: true,
                        showHelp: false,
                        type: 'inqselect',
                        name: 'category',
                        title: `${projectOpts ? selectedProject.dir : 'Default'
                            } Configuration`,
                        choices: [
                            {
                                value: 'docker',
                                name: 'Docker - Docker and docker-compose behavior (workingDir, orphaned containers / exec environment variables)',
                            },
                            {
                                value: 'npmNode',
                                name: 'NPM and Node - watch files / paths to ignore when watching files / force install dependencies',
                            },
                            {
                                value: 'ui',
                                name: 'UI - DNV UI behavior and features (load logs since when / scrollback / displayed services)',
                            },
                        ],
                    };
                },
            },
            settings: {
                nextSection: 'setting',
                backSection: 'category',
                name: 'settings',

                prompt: function (answers) {
                    if (!answers) {
                        return [];
                    }
                    const { category } = answers;

                    if (!category) {
                        return [];
                    }

                    const [settings, prompts] = cloneDeep(
                        categorySettingsAndPrompts[category]
                    );

                    let { message, name, type, choices, title } = settings;

                    if (title && title !== currentTitle) {
                        currentTitle = title;
                        title2(title, true);
                    }

                    let filledChoices = choices.map((choice) => {
                        let { name, value } = choice;
                        let configValue =
                            answers[value] !== undefined
                                ? answers[value]
                                : projectOpts
                                    ? selectedProject[value]
                                    : defaultConfig[value];

                        const isDefault =
                            projectOpts && configValue === 'default';

                        if (isDefault) {
                            configValue = defaultConfig[value];
                        }

                        if (Array.isArray(configValue)) {
                            if (configValue.length) {
                                if (typeof configValue[0] === 'object') {
                                    configValue = configValue
                                        .filter((val) => val)
                                        .filter((val) => val.enabled)
                                        .map((val) => val.value)
                                        .join(', ');
                                } else {
                                    configValue = configValue.join(', ');
                                }
                            } else {
                                configValue = '';
                            }
                        } else if (typeof configValue === 'object') {
                            let tmp = '';

                            for (const [key, val] of Object.entries(
                                configValue
                            )) {
                                if (Array.isArray(val)) {
                                    tmp += `${key}: ${Array.isArray(val)
                                        ? typeof val[0] === 'object' ? val.map(v => v.value).join(', ') : val.join(', ')
                                        : val
                                        }`;
                                }
                            }

                            configValue = tmp;
                        }

                        if (projectOpts && isDefault) {
                            name =
                                name +
                                ' ' +
                                chalk.cyanBright.italic(
                                    `${configValue} (default)`
                                );
                        } else {
                            name =
                                name +
                                ' ' +
                                chalk.cyanBright.italic(configValue);
                        }

                        return {
                            name,
                            value,
                        };
                    });

                    filledChoices = [
                        ...filledChoices,
                        new inquirer.Separator(),
                        {
                            name: chalk.blueBright('Save and Exit'),
                            value: 'save_and_exit',
                            focus: chalk.cyanBright.underline,
                            blur: chalk.blueBright,
                        },

                        {
                            name: chalk.red('Cancel'),
                            value: 'cancel_and_close',
                            focus: chalk.redBright.underline,
                            blur: chalk.red,
                        },
                    ].filter((val) => val);

                    return {
                        title: prompts.title,
                        message,
                        name: name || '',
                        type,
                        choices: filledChoices,
                    };
                },
            },
            setting: {
                nextSection: 'settings',
                backSection: 'settings',
                name: ' setting',

                prompt: async function (answers, setDefs, setAnswers) {
                    if (!answers) {
                        return [];
                    }

                    const { category, settingName } = answers;
                    const [settings, prompts] =
                        categorySettingsAndPrompts[category];

                    let { title } = settings;

                    if (title && title !== currentTitle) {
                        currentTitle = title;
                        title2(title, true);
                    }

                    if (prompts[settingName]) {
                        let opts;

                        if (typeof prompts[settingName] === 'function') {
                            opts = await prompts[settingName](
                                answers,
                                setDefs,
                                setAnswers,
                                title
                            );
                        } else {
                            opts = prompts[settingName];
                        }

                        let {
                            message,
                            name = 'whatever',
                            type,
                            choices = [],
                            defaultValue,
                            submitted,
                        } = opts;

                        if (typeof choices === 'function') {
                            choices = choices();
                        }

                        const configValue =
                            answers[name] !== undefined
                                ? answers[name]
                                : projectOpts
                                    ? selectedProject[name]
                                    : defaultConfig[name];

                        return {
                            message,
                            name: name || '',
                            type,
                            choices,
                            default: defaultValue || configValue,
                            submitted,
                        };
                    } else {
                        return [];
                    }
                },
            },
        },
        flow: ['category', 'settings', 'setting'],
    };

    const mPrompt = new MultiPrompt(configApp, 'category');

    let answers = await mPrompt.display();

    process.stdout.write(ansiEscapes.clearTerminal);

    if (answers !== 'cancelled' && typeof answers === 'object') {
        answers = pickAnswers(
            answers,
            config.get('defaultConfig'),
            projectOpts
        );

        if (answers.packageManager) {
            if (answers.packageManager === 'yarn 2') {
                answers.packageManager = 'yarn';
                answers.yarnVersion = 2;
            } else if (answers.packageManager === 'yarn') {
                answers.yarnVersion = 1;
            } else {
                answers.yarnVersion = null;
            }
        }

        if (answers.uiStats && answers.uiStats.length) {
            answers.populateFailed = null;
        }

        if (projectOpts) {
            config.applyAnswers({ ...answers, recreateYml: true });
        } else {
            config.applyAnswers({ ...answers, recreateYml: true }, true);
        }

        if (projectOpts) {
            success('Project config set');
        } else {
            success('Default config set');
        }
    }
};

module.exports = configAction;
