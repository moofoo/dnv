const { config } = require('../../lib/config');
const { error } = require('../../lib/text');

const getRemoveOrphansPrompt = require('./prompts/removeOrphans');
const getExecEnvironmentPrompt = require('./prompts/execEnvironment');
const getWorkingDirPrompt = require('./prompts/workingDir');
const getDockerfileNodeImagePrompt = require('./prompts/dockerfileNodeImage');
const getComposeNodeImagePrompt = require('./prompts/composeNodeImage');

const docker = async (project = false, name) => {
    if (project) {
        const isSet = config.isProjectConfigSet();
        if (!isSet) {
            error('Project must be initialized with `dnv init` first');
            return;
        }
    }

    const removeOrphansPrompt = getRemoveOrphansPrompt(project);
    const execEnvironmentPrompt = getExecEnvironmentPrompt(project);
    const workingDirPrompt = getWorkingDirPrompt(project);
    const composeNodeImagePrompt = await getComposeNodeImagePrompt(project);
    const dockerfileNodeImagePrompt = await getDockerfileNodeImagePrompt(
        project
    );

    const title = `Update ${
        project ? (name ? name : 'Project') : 'Default'
    } Docker Configuration`;

    //title2(`Update ${project ? (name ? name : 'Project') : 'Default'} Docker Configuration`, true);

    const choices = [
        {
            value: 'composeNodeImage',
            name: 'Compose Image',
        },
        {
            value: 'dockerfileNodeImage',
            name: 'Docker Image',
        },
        {
            value: 'removeOrphans',
            name: 'Remove Orphans',
        },
        {
            value: 'execEnvironment',
            name: 'Exec Environment',
        },
    ];

    if (!project) {
        choices.push({
            value: 'workingDir',
            name: 'Working Directory',
        });
    }

    return [
        {
            title,
            name: 'settingName',
            type: 'inqselect',
            choices,
        },
        {
            removeOrphans: removeOrphansPrompt,
            execEnvironment: execEnvironmentPrompt,
            workingDir: workingDirPrompt,
            composeNodeImage: composeNodeImagePrompt,
            dockerfileNodeImage: dockerfileNodeImagePrompt,
        },
    ];
};

module.exports = docker;
