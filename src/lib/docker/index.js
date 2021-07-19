const { getDocker, hasDocker } = require('./util');
const { getImages, getNodeImages, getNodeImage } = require('./images');

const {
    getPackageVolume,
    volumeExists,
    getVolumeName,
    createPackageVolume,
    removePackageVolume,
    removePackageVolumes,
    getPackageVolumes,
} = require('./volumes');

const { populateAndInstall, dnvUp, dnvRm, dockerRun, serviceShell } = require('./cli');

const {
    startContainer,
    removeContainer,
    getContainerState,
    getContainerStateSync,
    stopContainer,
    killContainer,
    removeContainers,
    getContainerName,
    listContainers,
} = require('./containers');

const { removeNetworks } = require('./networks');

module.exports = {
    listContainers,
    stopContainer,
    getContainerName,
    getDocker,
    hasDocker,
    getImages,
    getNodeImages,
    getNodeImage,
    getPackageVolume,
    volumeExists,
    getVolumeName,
    createPackageVolume,
    removePackageVolume,
    removePackageVolumes,
    removeContainer,
    populateAndInstall,
    dnvUp,
    dnvRm,
    dockerRun,
    startContainer,
    getContainerState,
    getContainerStateSync,
    killContainer,
    removeContainers,
    getPackageVolumes,
    removeNetworks,
    serviceShell,
};
