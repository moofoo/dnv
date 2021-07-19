const { config } = require('../../../lib/config');

const externalVolume = (project = false, firstInit = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;

    let { externalVolume } = projectConfig || defaultConfig || { externalVolume: true };

    return {
        type: firstInit ? 'confirm' : 'inqconfirm',
        message: "Do you want DNV to manage your project's dependencies in an external volume?",
        default: externalVolume,
        name: 'externalVolume',
    };
};

module.exports = externalVolume;
