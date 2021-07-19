const inquirer = require('inquirer');
const { config } = require('../../../lib/config');
const fs = require('fs');
const { files } = require('../../../lib/files');

const inquire = (project = false, firstInit = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig(false) : null;
    const initProject = project && projectConfig === null;

    let { packageManager } = projectConfig || defaultConfig || {};

    let packageChoices;

    let defaultTop = true;

    if (!config.yarnVersion) {
        packageChoices = ['npm', 'yarn', 'yarn 2'];
    } else if (files.fileExists('.yarnrc.yml')) {
        defaultTop = false;
        packageManager = 'yarn 2';
        packageChoices = ['yarn 2', 'yarn', 'npm'];
    } else if (files.fileExists('yarn.lock')) {
        defaultTop = false;
        packageManager = 'yarn';
        packageChoices = ['yarn', 'yarn 2', 'npm'];
    } else {
        packageChoices = ['npm', 'yarn', 'yarn 2'];
    }

    if (defaultTop) {
        packageChoices = packageChoices.filter(
            (choice) => choice !== defaultConfig.packageManager
        );

        packageChoices.unshift({
            name: defaultConfig.packageManager + ' (default)',
            value: 'default',
        });
    }

    if (project) {
        if (initProject && !packageManager) {
            packageManager = null;
        }
    }

    return {
        type: firstInit ? 'list' : 'inqselect',
        name: 'packageManager',
        message: 'Package Manager',
        choices: packageChoices,
        default: packageManager,
    };
};

module.exports = inquire;
