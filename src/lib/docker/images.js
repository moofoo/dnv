const { getDocker } = require('./util');
const { getContainerStateSync, inspectContainer } = require('./containers');

const getImages = async (filters = {}) => {
    const images = await getDocker().listImages({
        filters,
    });

    return images.reduce((acc, curr) => {
        if (curr.RepoTags[0] !== '<none>:<none>') {
            return [...acc, curr.RepoTags[0]];
        }
        return acc;
    }, []);
};

const getNodeImages = async () => {
    const images = await getImages({ reference: ['*node*'] });

    let numbered = [];
    const latestCurrent = [];
    const other = [];

    for (const img of images) {
        if (img === 'node' || /^node:/.test(img)) {
            if (/^node:(\d+|\d+\.)+$/.test(img)) {
                numbered.push(img);
            } else if (img === 'node:latest' || img === 'node:current') {
                latestCurrent.push(img);
            } else {
                other.push(img);
            }
        }
    }

    numbered = numbered.sort().reverse();

    return [...numbered, ...latestCurrent, ...other];
};

const getNodeImage = async () => {
    const nodeImages = await getNodeImages();
    if (nodeImages.length === 0) {
        return null;
    }

    return nodeImages[0];
};

const removeImage = async (name) => {
    try {
        const image = await getDocker().getImage(name);

        if (image && image.remove) {
            await image.remove();
        }
    } catch {}
};

const removeImages = async (names) => {
    for (const name of names) {
        await removeImage(name);
    }
};

const getContainerImages = async (containerNames) => {
    containerNames = containerNames.filter((name) => {
        const state = getContainerStateSync(name);
        return state.exists;
    });

    let results = await Promise.all(
        containerNames.map((name) => inspectContainer(name))
    );

    if (results.length) {
        /*
            need to be absolutely sure we don't delete node images
            container names will be like: myproject_service_1
        */

        results = results
            .map((result) => result && result.Config && result.Config.Image)
            .filter((val) => val)
            .filter((val) => {
                if (val === 'node') {
                    return false;
                }
                if (
                    /^node($|:(([1-9][1-9])|current|latest|stretch|buster|slim|alpine|fermium))/.test(
                        val
                    )
                ) {
                    return false;
                }

                return true;
            });

        if (results.length) {
            const nodeImages = await getNodeImages();

            results = results.filter((result) => {
                for (const nodeImage of nodeImages) {
                    if (result === nodeImage) {
                        return false;
                    }
                }

                return true;
            });
        }

        return results;
    }

    return [];
};

const removeContainerImages = async (containerNames) => {
    let imageNames = await getContainerImages(containerNames);

    if (imageNames.length) {
        const nodeImages = await getNodeImages();

        imageNames = imageNames.filter((name) => {
            for (const nodeImage of nodeImages) {
                if (name === nodeImage) {
                    return false;
                }
            }

            return true;
        });

        await removeImages(imageNames);
    }
};

module.exports = {
    getImages,
    getNodeImages,
    getNodeImage,
    removeImages,
    removeContainerImages,
    getContainerImages,
};
