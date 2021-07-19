const { getDocker } = require('./util');

const removeNetwork = async (Id) => {
    const net = await getDocker().getNetwork(Id);
    await net.remove();
};

const removeNetworks = async (names) => {
    if (names !== null && !Array.isArray(names)) {
        names = [names];
    }

    const docker = getDocker();
    const networks = await docker.listNetworks();

    await Promise.all(
        Object.values(networks)
            .filter((network) => {
                if (!names) {
                    if (network.Name.includes('defnet')) {
                        return true;
                    }
                } else {
                    for (const name of names) {
                        if (network.Name.includes(name)) {
                            return true;
                        }
                    }
                }
                return false;
            })
            .map((network) => removeNetwork(network.Id))
    );
};

const removeDnvNetworks = async () => {
    const docker = getDocker();
    const networks = await docker.listNetworks();

    for (const network of networks) {
        if (network.Name.includes('defnet')) {
            const net = await docker.getNetwork(network.Id);
            net.remove();
        }
    }
};

module.exports = {
    removeNetworks,
    removeDnvNetworks,
};
