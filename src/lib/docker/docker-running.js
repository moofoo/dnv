const { getDocker } = require('./util');

const isDockerRunning = async () => {
    try {
        const docker = getDocker();
        if (docker && docker.version) {
            const version = await docker.version();

            if (version && version.Version) {
                return true;
            }
        }

        return false;
    } catch (err) {}

    return false;
};

module.exports = isDockerRunning;
