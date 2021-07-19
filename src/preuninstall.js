const path = require('path');
const { config } = require('./lib/config');
const { removeDnvContainers } = require('../../lib/docker/containers');
const { removeDnvVolumes } = require('../../lib/docker/volumes');
const { removeDnvNetworks } = require('../../lib/docker/networks');
const { removeContainerImages } = require('../../lib/docker/images');

const configs = config.getAllProjectConfigs() || [];

async function deleteConfig(env = process.env) {
    const argv = env.npm_config_argv || '{}';
    const { original = [] } = JSON.parse(argv);

    // The `preuninstall` hook also runs when the package gets updated to a new version (i.e. npm update -g jenni).
    // But we should Delete the config only when Jenni gets uninstalled explicitly. (i.e. npm uninstall -g jenni)

    if (!original.includes('uninstall')) return;

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
}

if (require.main === module) {
    // execute the fn only if script called from the command line. i.e. node <path/to/file>
    deleteConfig().catch((error) => {
        console.log(error);
    });
} else {
    // for testing purpose export the fn
    module.exports = deleteConfig;
}
