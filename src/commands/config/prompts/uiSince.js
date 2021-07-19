const { config } = require('../../../lib/config');

const inquire = (project = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;

    let { uiSince } = projectConfig || defaultConfig || { uiSince: 'docker' };

    return {
        type: 'inqselect',
        name: 'uiSince',
        message: 'Load service logs in the UI since when?',
        choices: [
            {
                value: 'docker',
                name: 'From service start time if DNV starts the service. If service already running, then load entire log (default docker-compose up behavior)',
            },
            {
                value: 'started',
                name: 'From service start time, whether DNV starts the service or already running',
            },
            {
                value: 'created',
                name: 'Entire log, whether DNV starts the service or already running',
            },
            {
                value: '24h',
                name: 'Past 24 hours',
            },
            {
                value: '48h',
                name: 'Past 48 hours',
            },
            {
                value: '72h',
                name: 'Past 72 hours',
            },
        ],
        default: uiSince,
    };
};

module.exports = inquire;
