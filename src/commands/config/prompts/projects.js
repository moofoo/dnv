const inquirer = require('inquirer');
const { config } = require('../../../lib/config');

const project = async () => {
    const projectConfigs = config.get('projectConfigs');
    const projectConfig = config.getProjectConfig();

    if (!projectConfigs) {
        return;
    }

    const choices = [];

    let defaultChoice;

    let inProjectDir = false;

    if (projectConfig) {
        inProjectDir = true;
        choices.push({
            name: projectConfig.shortPath,
            value: projectConfig.pathKey,
        });
    }

    for (const project of Object.values(projectConfigs)) {
        if (!defaultChoice && projectConfig && project.path === projectConfig.path) {
            defaultChoice = project.pathKey;
        }

        if (!inProjectDir || (inProjectDir && project.pathKey !== projectConfig.pathKey)) {
            choices.push({
                name: project.shortPath,
                value: project.pathKey,
            });
        }
    }

    const { pathKeys } = await inquirer.prompt([
        {
            type: 'checkbox',
            message: 'Select projects',
            choices,
            name: 'pathKeys',
            default: defaultChoice,
        },
    ]);

    return pathKeys.map((key) => projectConfigs[key]);
};

module.exports = project;
