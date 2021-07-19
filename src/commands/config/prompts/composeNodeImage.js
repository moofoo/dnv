const inquirer = require('inquirer');
const { getNodeImages } = require('../../../lib/docker/images');
const { config } = require('../../../lib/config');
const { i } = require('../../../lib/ui/blessed/patched/color/vscode/charCode');

const inquire = async (
    project = false,
    firstInit = false,
    defaultImage = null
) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;
    const initProject = project && projectConfig === null;

    let { composeNodeImage, dockerfileNodeImage } =
        projectConfig || defaultConfig || {};

    const nodeImages = await getNodeImages();

    nodeImages.sort((a, b) => {
        const nodeA = /^node:[0-9]/.test(a);
        const nodeB = /^node:[0-9]/.test(b);

        if (nodeA && nodeB) {
            return a.length - b.length;
        }

        if (nodeA && !nodeB) {
            return -1;
        }

        return 0;
    });

    let composeImageChoices = initProject
        ? nodeImages.map((image) => {
              return {
                  name:
                      composeNodeImage === image
                          ? `${image} (current)`
                          : dockerfileNodeImage === image
                          ? `${image} (dockerfile)`
                          : defaultConfig.composeNodeImage === image
                          ? `${image} (default)`
                          : image,
                  value: image,
              };
          })
        : nodeImages;

    if (project) {
        if (initProject) {
            composeNodeImage = 'default';
        }
    }

    return {
        type: firstInit ? 'list' : 'inqselect',
        offset: false,
        name: 'composeNodeImage',
        message: 'DNV Compose Node Image',
        choices: composeImageChoices,
    };
};

module.exports = inquire;
