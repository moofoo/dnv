const { config } = require('../../lib/config');
const { error } = require('../../lib/text');

const getWatchFilesPrompt = require('./prompts/watchFiles');
const getForceInstallPrompt = require('./prompts/forceInstall');
const getWatchIgnorePrompt = require('./prompts/watchIgnore');
const getInstallGlobalsPrompt = require('./prompts/installGlobals');

const npmNode = (project = false, name) => {
    if (project) {
        const isSet = config.isProjectConfigSet();
        if (!isSet) {
            error('Project must be initialized with `dnv init` first');
            return;
        }
    }

    let watchFilesPrompt;
    let installGlobalPrompt;

    if (project) {
        watchFilesPrompt = getWatchFilesPrompt(project, false);
        installGlobalsPrompt = getInstallGlobalsPrompt(project, false);

    }

    const forceInstallPrompt = getForceInstallPrompt(project, false);
    const watchIgnorePrompt = getWatchIgnorePrompt(project, false);

    const title = `Update ${project ? (name ? name : 'Project') : 'Default'
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

    if (project) {
        choices.push({
            value: 'watchFiles',
            name: 'Restart containers when files change',
        });

        choices.push({
            value: 'installGlobals',
            name: 'Install global dependencies in Node service containers',
        });
    }

    const prompts = {
        watchIgnore: watchIgnorePrompt,
        forceInstall: forceInstallPrompt,
    };

    if (project) {
        prompts.watchFiles = watchFilesPrompt;
        prompts.installGlobals = installGlobalsPrompt;
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
