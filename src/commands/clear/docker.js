const inquirer = require('inquirer');
const path = require('path');
const { dnvDown } = require('../../lib/docker/cli');
const { removeVolumes } = require('../../lib/docker/volumes');
const { removeContainers } = require('../../lib/docker/containers');
const { getContainerImages, removeImages } = require('../../lib/docker/images');

const { config } = require('../../lib/config');
const { removeNetworks } = require('../../lib/docker/networks');

const projects = require('../config/prompts/projects');

const docker = async (
    other = false,
    pathKey = null,
    removeImagesPrompt = true,
    force = false
) => {
    const configs = config.getAllProjectConfigs() || [];

    let keys = [pathKey];

    if (!pathKey && configs.length) {
        keys = (await projects()).map((proj) => proj.pathKey);
    }

    if (force) {
        other = true;
    }

    if (!other) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'other',
                message: 'Remove non-node containers/volumes/networks?',
                default: false,
            },
        ]);

        other = answers.other;
    }

    keys.forEach((key) => {
        if (configs[key]) {
            config.setProjectConfigProp(key, 'execItems', {});
            config.setProjectConfigProp(key, 'recentItems', {});
            config.setProjectConfigProp(key, 'populateFailed', null);
            config.delete(`projectConfigs.${key}.usersSetup`);
        }
    });

    const selectedConfigs = keys
        .filter((key) => configs[key])
        .map((key) => configs[key]);

    const downData = selectedConfigs.map((config) => {
        return {
            externalVolume: config.externalVolume,
            name: config.name,
            cwd: config.composeFile.replace(
                '/' + path.basename(config.composeFile),
                ''
            ),
        };
    });

    const containerNames = selectedConfigs
        .map((config) => Object.values(config.services))
        .flat()
        .map((service) => service.containerName);

    const nodeContainerNames = selectedConfigs
        .map((config) => Object.values(config.services))
        .flat()
        .filter((service) => service.isNode)
        .map((service) => service.containerName);

    const volumeNames = selectedConfigs
        .map((config) => Object.values(config.services))
        .flat()
        .map((service) => service.volumeName);

    let remImages = false;
    let images = [];

    if (removeImagesPrompt) {
        images = await getContainerImages(nodeContainerNames);

        if (images.length) {
            if (removeImagesPrompt === 'force' || force) {
                remImages = true;
            } else {
                const answers = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'remImages',
                        message: `Remove images? (${images.join(', ')})`,
                        default: false,
                    },
                ]);
                remImages = answers.remImages;
            }
        }
    }

    for (const data of downData) {
        dnvDown(data);
    }

    await removeContainers(other ? containerNames : nodeContainerNames);
    await removeVolumes(volumeNames);

    if (remImages && images.length) {
        await removeImages(images);
    }

    return keys;
};

module.exports = docker;
