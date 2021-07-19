const inquirer = require('inquirer');
const { getNodeImages } = require('../../../lib/docker/images');
const { config } = require('../../../lib/config');

const inquire = async (project = false, firstInit = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;
    const initProject = project && projectConfig === null;

    let { dockerfileNodeImage } = projectConfig || defaultConfig || {};

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

    let dockerImageChoices = initProject
        ? nodeImages.map((image) => {
              return {
                  name: dockerfileNodeImage === image ? `${image} (default)` : image,
                  value: image,
              };
          })
        : nodeImages;

    if (project) {
        if (initProject) {
            dockerfileNodeImage = 'default';
        }
        dockerImageChoices = [
            {
                name: defaultConfig.dockerfileNodeImage + ' (default)',
                value: 'default',
            },
            new inquirer.Separator(),
            ...dockerImageChoices,
        ];
    }

    return {
        type: firstInit ? 'list' : 'inqselect',
        name: 'dockerfileNodeImage',
        message: 'Dockerfile Node Image',
        choices: dockerImageChoices,
        default: dockerfileNodeImage,
    };
};

module.exports = inquire;
