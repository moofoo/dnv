const docker = require('./docker');
const { config } = require('../../lib/config');

const all = async (
    other = false,
    pathKey = null,
    removeImages = true,
    force = false
) => {
    const keys = await docker(other, pathKey, removeImages, force);

    keys.forEach((key) => {
        config.delete(`projectConfigs.${key}`);
    });
};

module.exports = all;
