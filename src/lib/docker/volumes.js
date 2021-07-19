const { getDocker } = require('./util');
const { files } = require('../files');

const getPackageVolume = async (name, suffix = 'dnv_volume') => {
    const volume = await getDocker().getVolume(name || getVolumeName(suffix));

    return volume;
};

const volumeExists = async (volumeName, suffix = 'dnv_volume') => {
    volumeName = volumeName || getVolumeName(volumeName, suffix);

    const { Volumes } = await getDocker().listVolumes({
        filters: { name: [volumeName] },
    });

    return !!Volumes.find((volume) => {
        return volume.Name === volumeName;
    });
};

const getVolumeName = (suffix = 'dnv_volume') => {
    return files.getUniqueName(suffix);
};

const createPackageVolume = (labels = {}, name, suffix = 'dnv_volume') => {
    return new Promise(async (resolve) => {
        const exists = await volumeExists(name, suffix);

        if (!exists) {
            await getDocker().createVolume({
                Name: name || getVolumeName(suffix),
                Labels: {
                    'is-dnv': 'true',
                    'path-key': files.getPathKey(),
                    'dnv-project': files.getUniqueName(),
                    ...labels,
                },
            });

            resolve(true);
        }

        resolve(false);
    });
};

const removeVolumeByLabel = async (labels) => {
    const volumes = await getPackageVolumes(labels);

    if (volumes && volumes.length) {
        for (const volume of volumes) {
            let dockerVolume;
            try {
                dockerVolume = await getDocker().getVolume(volume);
            } catch (err) {}

            if (dockerVolume) {
                try {
                    dockerVolume.remove();
                } catch (err) {}
            }
        }
    }
};

const removeProjectVolume = async (projectName) => {
    await removeVolumeByLabel({ 'dnv-project': projectName });
};

const removeVolume = async (name) => {
    try {
        const volume = await getDocker().getVolume(name);
        await volume.remove();
    } catch {}
};

const removeVolumes = async (names) => {
    await Promise.all(names.map((name) => removeVolume(name)));
};

const removePackageVolume = async (name, suffix = 'dnv_volume') => {
    const exists = await volumeExists(name, suffix);

    if (exists) {
        const volume = await getPackageVolume(name, suffix);
        await volume.remove();

        return true;
    }

    return false;
};

const getPackageVolumes = async (labels = {}) => {
    labels = Object.keys(labels).reduce((acc, curr) => {
        return [...acc, `${curr}=${labels[curr]}`];
    }, []);

    const { Volumes = [] } = await getDocker().listVolumes({
        filters: { label: ['is-dnv', ...labels] },
    });

    return Volumes.map((volume) => {
        return volume.Name;
    });
};

const removePackageVolumes = async (labels = {}) => {
    const volumes = await getPackageVolumes(labels);

    for (const volume of volumes) {
        const vol = await getDocker().getVolume(volume);
        if (vol && vol.remove) {
            vol.remove();
        }
    }
};

const removeDnvVolumes = async () => {
    const { Volumes = [] } = await getDocker().listVolumes({
        filters: { label: ['is-dnv'] },
    });

    await removeVolumes(
        Volumes.map((volume) => {
            return volume.Name;
        })
    );
};

module.exports = {
    removeVolume,
    removeVolumes,
    getPackageVolume,
    volumeExists,
    getVolumeName,
    createPackageVolume,
    removePackageVolume,
    removePackageVolumes,
    getPackageVolumes,
    removeProjectVolume,
    removeDnvVolumes,
};
