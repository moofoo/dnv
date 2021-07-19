const { config } = require('../../../lib/config');

const inquire = (project = false, init = false, services) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : { services };

    let { watchFiles } = projectConfig || defaultConfig || { watchFiles: [] };

    services = services || projectConfig.services;

    const choices = Object.keys(services).filter(
        (name) => services[name].isNode
    );

    return {
        type: init ? 'checkbox' : 'inqcheck',
        message:
            'Restart containers when source files change? Select services:',
        default: watchFiles,
        name: 'watchFiles',
        choices,
    };
};

module.exports = inquire;
