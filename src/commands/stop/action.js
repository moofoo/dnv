const execa = require('execa');
const { config } = require('../../lib/config');
const { files } = require('../../lib/files');
const { error } = require('../../lib/text');
const project = require('../config/prompts/project');

const stopAction = async (opts = {}) => {
    const isSet = config.isProjectConfigSet();

    const projectConfigs = config.get('projectConfigs');

    if (!projectConfigs) {
        error('No projects have been initialized');
        return;
    }

    let selectedProject;

    if (!isSet) {
        selectedProject = await project();
    } else {
        selectedProject = config.getProjectConfig(true);
    }

    let { name: projectName, externalVolume } = selectedProject || {};

    let cwd = (selectedProject && selectedProject.path) || files.cwd;

    if (externalVolume) {
        execa.commandSync(
            `docker-compose -p ${projectName} -f docker-compose-dnv-gen.yml stop`,
            {
                stdio: 'inherit',
                cwd,
            }
        );
    } else {
        execa.commandSync(`docker-compose -p ${projectName} stop`, {
            stdio: 'inherit',
            cwd,
        });
    }
};

module.exports = stopAction;
