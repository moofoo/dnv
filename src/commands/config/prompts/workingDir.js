const { config } = require('../../../lib/config');

const workDir = (project = false) => {
    const defaultConfig = config.get('defaultConfig');
    const projectConfig = project ? config.getProjectConfig() : null;

    let { workingDir } = projectConfig ||
        defaultConfig || { workingDir: '/usr/src/app' };

    return {
        type: 'inqinput',
        message: 'Working directory (WORKDIR)',
        default: workingDir,
        name: 'workingDir',
        validate: (input) => {
            if (input.charAt(0) !== '/') {
                return 'Working directory must begin with a forward slash';
            }

            return true;
        },
    };
};

module.exports = workDir;
