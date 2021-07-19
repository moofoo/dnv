const inquirer = require('inquirer');
const { config } = require('../../../lib/config');

const project = async () => {
    const projectConfigs = config.get('projectConfigs');
    const projectConfig = config.getProjectConfig();

    if (!projectConfigs) {
        return;
    }

    const map = {};

    const choices = [];

    let defaultChoice;

    let x = 0;

    for (const project of Object.values(projectConfigs)) {
        if (!defaultChoice && projectConfig && project.path === projectConfig.path) {
            defaultChoice = project.pathKey;
        }

        choices.push({
            name: project.shortPath,
            value: project.pathKey,
        });
    }

    const { pathKey } = await inquirer.prompt([
        {
            type: 'list',
            message: 'Select project',
            choices,
            name: 'pathKey',
            default: defaultChoice,
        },
    ]);

    if (pathKey) {
        return projectConfigs[pathKey];
    }

    return null;
};

module.exports = project;
