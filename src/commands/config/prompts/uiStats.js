const { config } = require('../../../lib/config');

const inquire = (project = false, init = false, services) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;

    let { uiStats } = projectConfig || defaultConfig || { uiStats: [] };

    services = services || projectConfig.services;

    const choices = Object.keys(services).filter((name) => services[name].isNode);

    return {
        type: init ? 'checkbox' : 'inqcheck',
        message: 'Enable metrics display for the selected node services',
        default: uiStats,
        name: 'uiStats',
        choices,
    };
};

module.exports = inquire;
