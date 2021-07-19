const { config } = require('../../lib/config');
const { error } = require('../../lib/text');

const getWatchFilesPrompt = require('./prompts/watchFiles');
const getForceInstallPrompt = require('./prompts/forceInstall');
const getWatchIgnorePrompt = require('./prompts/watchIgnore');

const npmNode = (project = false, name) => {
    if (project) {
        const isSet = config.isProjectConfigSet();
        if (!isSet) {
            error('Project must be initialized with `dnv init` first');
            return;
        }
    }

    let watchFilesPrompt;

    if (project) {
        watchFilesPrompt = getWatchFilesPrompt(project, false);
    }

    const forceInstallPrompt = getForceInstallPrompt(project, false);
    const watchIgnorePrompt = getWatchIgnorePrompt(project, false);

    const title = `Update ${
        project ? (name ? name : 'Project') : 'Default'
    } NPM and Node Configuration`;

    const choices = [
        {
            value: 'watchIgnore',
            name: 'Ignore patterns when watching files',
        },
        {
            value: 'forceInstall',
            name: 'Force install dependencies in external volume',
        },
    ];

    if (!project) {
        choices.push({
            value: 'watchFiles',
            name: 'Restart containers when files change',
        });
    }

    const prompts = {
        watchIgnore: watchIgnorePrompt,
        forceInstall: forceInstallPrompt,
    };

    if (!project) {
        prompts.watchFiles = watchFilesPrompt;
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

module.exports = npmNode;
