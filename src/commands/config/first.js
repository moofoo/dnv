const { config } = require('../../lib/config');
const { getNodeImage } = require('../../lib/docker/images');
const { error } = require('../../lib/text');

const initDefaults = async (firstInit = false, project = false) => {
    const nodeImage = await getNodeImage();

    if (!nodeImage) {
        error('Please pull at least one Node image');
        process.exit(0);
    }

    if (!project && firstInit) {
        answers = {
            composeNodeImage: nodeImage,
            dockerfileNodeImage: nodeImage,
            packageManager: 'npm',
            yarnVersion: null,
            workingDir: '/usr/src/app',
            uiSince: 'docker',
            uiScrollback: 1000,
            removeOrphans: true,
            watchFiles: true,
            watchIgnore: [
                {
                    value: String.raw`/(^|[\/\\])\../`,
                    enabled: true,
                },
                {
                    value: '**/node_modules/**',
                    enabled: true,
                },
                {
                    value: '**/.yarn/**',
                    enabled: true,
                },
                {
                    value: '**/Dockerfile*',
                    enabled: true,
                },
                {
                    value: '**/docker-compose*yml',
                    enabled: true,
                },
            ],
            forceInstall: [
                {
                    value: 'node-gyp',
                    enabled: true,

                },
            ],
            execEnvironment: [
                {
                    value: 'TERM=xterm-256color',
                    enabled: true,
                },
                {
                    value: 'LC_ALL=C.UTF-8',
                    enabled: true,
                },
                {
                    value: 'LANG=C.UTF-8',
                    enabled: true,
                },
                {
                    value: 'NODE_ENV=production',
                    enabled: true,
                },
            ],
        };
    }

    if (project) {
        config.applyAnswers(answers);
    } else {
        config.applyAnswers(answers, true);
    }

    return answers;
};

module.exports = initDefaults;
