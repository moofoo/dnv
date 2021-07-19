const { config } = require('../../../lib/config');

const inquire = async () => {
    const projectConfig = config.getProjectConfig();

    if (!projectConfig) {
        return {};
    }

    let { services } = projectConfig;

    return {
        type: 'inqcheck',
        name: 'uiServices',
        message: 'Services to display in DNV UI',
        choices: Object.keys(services),
    };
};

module.exports = inquire;
