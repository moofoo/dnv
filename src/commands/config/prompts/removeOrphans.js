const { config } = require('../../../lib/config');

const removeOrphans = (project = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;

    let { removeOrphans } = projectConfig || defaultConfig || { removeOrphans: true };

    return {
        type: 'inqconfirm',
        message: 'Automatically remove containers of orphaned services',
        default: removeOrphans,
        name: 'removeOrphans',
    };
};

module.exports = removeOrphans;
