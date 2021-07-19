const path = require('path');
const rimraf = require('rimraf');
let { config } = require('../../lib/config');

const { removeDnvContainers } = require('../../lib/docker/containers');
const { removeDnvVolumes } = require('../../lib/docker/volumes');
const { removeDnvNetworks } = require('../../lib/docker/networks');
const { removeContainerImages } = require('../../lib/docker/images');

const all = async () => {
    const configs = config.getAllProjectConfigs() || [];

    if (configs.length) {
        const nodeContainerNames = Object.values(configs)
            .map((config) => Object.values(config.services))
            .flat()
            .filter((service) => service.isNode)
            .map((service) => service.containerName);

        await removeContainerImages(nodeContainerNames);
    }

    await removeDnvContainers();
    await removeDnvVolumes();
    await removeDnvNetworks();

    const configPath = config.path;

    config = null;

    rimraf.sync(configPath.replace('/' + path.basename(configPath), ''));
};

module.exports = all;
