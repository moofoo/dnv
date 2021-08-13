const Conf = require('conf');
const isOnline = require('is-online');
const execa = require('execa');
const { files } = require('./files');
const isDockerRunning = require('./docker/docker-running');
const { getNodeImage } = require('./docker/images');
const parseArgs = require('minimist');

const argv = parseArgs(process.argv);

const yarnVersion = async () => {
    let output;

    try {
        output = await execa.command(`yarn --version`, { stdio: 'pipe' });
    } catch (err) {
        return false;
    }

    if (!output.stdout) {
        return false;
    }

    const split = output.stdout.trim().split('.');

    split.pop();

    return Number(split.join('.'));
};

class Config extends Conf {
    constructor(options = {}) {
        options = {
            configName: argv.projectName ? argv.projectName : 'dnv',
            projectName: argv.projectName ? argv.projectName : 'dnv',
            ...options,
        };

        super(options);

        files.on('change', () => {
            const projectConfig = config.getProjectConfig(false);
            if (projectConfig) {
                files.getUniqueName(null, projectConfig.name);
            }
        });
    }

    async setup() {
        const [online, yarnVer, dockerRunning] = await Promise.all([
            isOnline(),
            yarnVersion(),
            isDockerRunning(),
        ]);

        this.isOnline = online;
        this.yarnVersion = yarnVer;
        this.dockerRunning = dockerRunning;
        this.hasNodeImage = this.dockerRunning ? !!(await getNodeImage()) : false;

    }

    get(key, defaultVal) {
        return super.get(key, defaultVal);
    }

    set(key, val) {
        return super.set(key, val);
    }

    merge(key, val, overwrite = []) {
        const existing = this.get(key);

        if (!existing || overwrite.includes(key)) {
            this.set(key, val);
        } else {
            if (Array.isArray(existing)) {
                let a;
                if (Array.isArray(val)) {
                    a = [...existing, ...val];
                    this.set(key, a);
                } else {
                    a = [...existing, val];
                    this.set(key, a);
                }
                return a;
            }

            if (typeof existing === 'object' && typeof val === 'object') {
                const m = { ...existing, ...val };
                this.set(key, m);
                return m;
            }
        }

        return this.get(key);
    }

    isDefaultConfigSet() {
        return !!this.get('defaultConfig');
    }

    mergeProjectConfig(data = {}, cwd) {
        cwd = cwd || files.cwd;
        const pathKey = files.getPathKey(cwd);
        const key = `projectConfigs.${pathKey}`;

        let isNew;

        let projectConfig = this.get(key);

        if (!projectConfig) {
            projectConfig = {};
            isNew = true;
        } else {
            isNew = false;
        }

        let merged = this.merge(key, isNew ? { ...data } : data);

        if (!isNew) {
            merged = { ...projectConfig, ...merged };
            this.set(key, merged);
        }

        return this.get(key);
    }

    applyAnswers(answers = {}, setDefaults = false, cwd) {
        cwd = cwd || files.cwd;
        const config = this.get('defaultConfig') || {};

        if (setDefaults) {
            Object.keys(answers).forEach((key) => {
                config[key] = answers[key];
            });

            this.set('defaultConfig', config);
            return config;
        }

        const pathKey = files.getPathKey(cwd);
        const key = `projectConfigs.${pathKey}`;
        let projectConfig = this.get(key);

        for (const key of Object.keys(answers)) {
            if (
                (projectConfig[key] === 'default' ||
                    JSON.stringify(projectConfig[key]) ===
                    JSON.stringify(answers[key])) &&
                JSON.stringify(config[key]) === JSON.stringify(answers[key])
            ) {
                projectConfig[key] === 'default';
            } else {
                projectConfig[key] = answers[key];
            }
        }

        this.set(key, projectConfig);

        return projectConfig;
    }

    setProjectConfigProp(projKey, key, value) {
        projKey = projKey || files.getPathKey();

        let config = this.get(`projectConfigs.${projKey}`);

        if (!!config && typeof projKey === 'object') {
            const configs = this.getAllProjectConfigs();

            const key = Object.keys(projKey)[0];
            const val = Object.values(projKey)[0];

            for (const c of configs) {
                if (c[key] === val) {
                    config = c;
                    break;
                }
            }
        }

        if (!config) {
            throw new Error(
                'setProjectConfigProp called on nonexistent config ' +
                key +
                value
            );
        }

        const pathKey = config.pathKey;
        const configKey = `projectConfigs.${pathKey}`;

        if (Array.isArray(key) && Array.isArray(value)) {
            for (let x = 0; x < key.length; x++) {
                config[key[x]] = value[x];
            }
        } else {
            config[key] = value;
        }

        this.set(configKey, config);
    }

    log(msg) {
        const err = this.get('error_log', []);

        err.push(msg);

        this.set('error_log', err);
    }

    setProjectConfig(key, value) {
        const projectConfig = this.getProjectConfig();
        projectConfig[key] = value;
        const pathKey = files.getPathKey();
        const projKey = `projectConfigs.${pathKey}`;
        this.set(projKey, projectConfig);
    }

    mergeDefaultConfig(data) {
        this.merge(`defaultConfig.${key}`, data);
    }

    setDefaultConfig(key, value) {
        const defaultConfig = this.get('defaultConfig');

        defaultConfig[key] = value;

        this.set('defaultConfig', defaultConfig);
    }

    isProjectConfigSet() {
        const pathKey = files.getPathKey();

        const projectConfig = this.get(`projectConfigs.${pathKey}`);
        return !!projectConfig;
    }

    getProjectConfig(useDefaults = true, showDefault = false, keys) {
        const pathKey = files.getPathKey();

        let projectConfig = this.get(`projectConfigs.${pathKey}`);

        const projectConfigSet = !!projectConfig;

        const defaults = this.get('defaultConfig');

        if (!projectConfigSet) {
            return null;
        }

        projectConfig = { ...projectConfig };

        if (!useDefaults) {
            return projectConfig;
        }

        keys = keys || Object.keys(projectConfig);

        const pConfig = keys.reduce((previous, current) => {
            let isDefault =
                projectConfig[current] === undefined ||
                projectConfig[current] === 'default';

            const def = defaults[current];

            return {
                ...previous,
                [isDefault && showDefault ? current + '__default' : current]:
                    projectConfig[current] === undefined ||
                        projectConfig[current] === 'default'
                        ? def
                        : projectConfig[current],
            };
        }, {});

        return pConfig;
    }

    setProjectConfig(data = {}) {
        const pathKey = files.getPathKey();
        this.set(`projectConfigs.${pathKey}`, data);
    }

    removeProject(key) {
        this.delete(`projectConfigs.${key || files.getPathKey()}`);
    }

    getAllProjectConfigs() {
        return this.get('projectConfigs');
    }
}

const config = new Config();

module.exports = {
    config,
    Config,
    yarnVersion,
};
