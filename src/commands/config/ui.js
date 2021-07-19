const { config } = require('../../lib/config');

const { error } = require('../../lib/text');
const getUiScrollbackPrompt = require('./prompts/uiScrollback');
const getUiSincePrompt = require('./prompts/uiSince');
const getUiServicesPrompt = require('./prompts/uiServices');
const getUiStatsPrompt = require('./prompts/uiStats');
const getUiReplDepsPrompt = require('./prompts/uiReplDeps');
const getUiReplDevDepsPrompt = require('./prompts/uiReplDevDeps');

const ui = async (project = false) => {
    if (project) {
        const isSet = config.isProjectConfigSet();
        if (!isSet) {
            error('Project must be initialized with `dnv init` first');
            return;
        }
    }

    const projectConfig = config.getProjectConfig();

    //const pkg = files.getPackageJson();
    const hasDeps = true; // Object.keys(pkg.dependencies || {}).length > 0;
    const hasDevDeps = true; //Object.keys(pkg.devDependencies || {}).length > 0;

    const uiScrollbackPrompt = getUiScrollbackPrompt(project);
    const uiSincePrompt = getUiSincePrompt(project);

    let uiStatsPrompt;
    let uiServicesPrompt;
    let uiReplDepsPrompt;
    let uiReplDevDepsPrompt;

    if (project) {
        uiStatsPrompt = getUiStatsPrompt(project);
        uiServicesPrompt = await getUiServicesPrompt();
        uiReplDepsPrompt = getUiReplDepsPrompt();
        uiReplDevDepsPrompt = getUiReplDevDepsPrompt();
    }

    const title = `Update ${
        project ? 'Project' : 'Default'
    } DNV UI Configuration`;

    const choices = [
        {
            value: 'uiScrollback',
            name: 'Terminal Scrollback',
        },
        {
            value: 'uiSince',
            name: 'Show logs since when?',
        },
    ];

    const prompts = {
        uiScrollback: uiScrollbackPrompt,
        uiSince: uiSincePrompt,
    };

    if (project) {
        prompts.uiStats = uiStatsPrompt;
        prompts.uiServices = uiServicesPrompt;
        prompts.uiReplDeps = uiReplDepsPrompt;
        prompts.uiReplDevDeps = uiReplDevDepsPrompt;

        if (projectConfig.externalVolume) {
            choices.push({
                value: 'uiStats',
                name: 'Enable metrics display for Node services in DNV UI',
            });
        }

        choices.push({
            value: 'uiServices',
            name: 'Only show selected services in UI',
        });

        if (hasDeps) {
            choices.push({
                value: 'uiReplDeps',
                name: 'Load dependencies in REPL session on startup',
            });
        }

        if (hasDevDeps) {
            choices.push({
                value: 'uiReplDevDeps',
                name: 'Load development dependencies in REPL session on startup',
            });
        }
    }

    return [
        {
            title,
            name: 'settingName',
            type: 'inqselect',
            choices,
        },
        prompts,
    ];
};

module.exports = ui;
