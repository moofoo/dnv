const util = require('util');
const { config } = require('../../lib/config');
const { files } = require('../../lib/files');
const project = require('../config/prompts/project');
const { error } = require('../../lib/text');

const logProject = (showDefault = false) => {
    console.log(
        util.inspect(
            config.getProjectConfig(true, showDefault, [
                'name',
                'composeFile',
                'formattedDir',
                'externalVolume',
                'composeNodeImage',
                'watchFiles',
                'watchIgnore',
                'forceInstall',
                'removeOrphans',
                'execEnvironment',
                'uiStats',
                'uiSince',
                'uiScrollback',
                'uiServices',
                'uiReplDeps',
                'uiReplDevDeps',
                'services',
                'populateFailed',
            ]),
            false,
            10,
            true
        )
    );
};

const infoAction = async (opts = {}) => {
    if (opts.all) {
        console.log(JSON.stringify(config.store, null, 4));
        return;
    }

    if (opts.path) {
        console.log(config.path);
        return;
    }

    if (opts.default) {
        console.log(config.get('defaultConfig'));
        return;
    }

    if (Object.keys(config.getAllProjectConfigs() || {}).length === 0) {
        error('No projects have been initialized');
        return;
    }

    const isSet = config.isProjectConfigSet();

    let choose = false;

    if (!opts.all && !opts.default && !opts.log) {
        if (!isSet) {
            choose = true;
        } else {
            logProject();
            return;
        }
    }

    if (choose) {
        selectedProject = await project();
        files.cwd = selectedProject.path;
        logProject();
        return;
    }
};

module.exports = infoAction;
