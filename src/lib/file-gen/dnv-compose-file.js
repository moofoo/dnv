const fs = require('fs');
const path = require('path');
const YAMLJS = require('yamljs');

const { files } = require('../files');
const ComposeFile = require('./compose-file');
const { config } = require('../config');

const { prepPath } = require('./util');

const { getCacheDir } = require('../../lib/find-deps');

class DnvComposeFile {
    static exists(filename = 'docker-compose-dnv-gen.yml', cwd = files.cwd) {
        filename = path.basename(filename);
        cwd = prepPath(cwd);
        return fs.existsSync(cwd + '/' + filename);
    }

    static getInstance(
        filename = 'docker-compose-dnv-gen.yml',
        composeFile = 'docker-compose.yml',
        cwd = files.cwd,
        cf = null,
        projectName = null,
    ) {
        filename = path.basename(filename);
        composeFile = path.basename(composeFile);

        cwd = prepPath(cwd);

        if (fs.existsSync(cwd + '/' + composeFile)) {
            const dnv = new DnvComposeFile(
                filename,
                composeFile,
                cwd,
                cf,
                projectName
            );

            return dnv;
        }

        return null;
    }

    constructor(
        dnvComposeFile = 'docker-compose-dnv-gen.yml',
        composeFile = 'docker-compose.yml',
        cwd = files.cwd,
        cf = null,
        projectName = null
    ) {
        this.dnvComposeFile = dnvComposeFile;
        this.composeFile = composeFile;
        this.cwd = prepPath(cwd);
        this.path = this.cwd + '/' + this.dnvComposeFile;
        this.cf = cf;
        this.projectName = projectName;
    }

    create(imageOverride, uiStats) {
        let { composeFile, cwd, cf, projectName } = this;

        cf = cf || ComposeFile.getInstance(composeFile, cwd, true, projectName);

        const { json, services } = cf;

        const composeOptions = {
            volumes: {},
            services: {},
        };

        for (const [key, val] of Object.entries(json)) {
            if (key !== 'services') {
                composeOptions[key] = val;
            }
        }

        let nodeCount = 0;

        for (const [serviceName, serviceInfo] of Object.entries(services)) {
            const {
                volumeName,
                compose,
                workingDir,
                isNode,
                packageManager,
                yarnVersion,
                managerFiles,
                user,
            } = serviceInfo;

            if (volumeName && !composeOptions.volumes[volumeName]) {
                composeOptions.volumes[volumeName] = {
                    external: true,
                };
            }

            composeOptions.services[serviceName] = {
                init: true,
                tty: true,
                labels: {
                    'is-dnv': 'true',
                    'project-name': cf.projectName,
                },
            };

            for (const [key, val] of Object.entries(compose)) {
                if (key !== 'build') {
                    composeOptions.services[serviceName][key] = val;
                }
            }

            if (isNode) {
                if (user) {
                    composeOptions.services[serviceName].user = user;
                }

                if (imageOverride) {
                    compose.image = imageOverride;
                    composeOptions.services[serviceName].image = imageOverride;
                }
                let { command, volumes } = compose;

                command = Array.isArray(command) ? command.join(' ') : command;

                let script = '';

                let addedStats = false;

                if (uiStats && uiStats.includes(serviceName)) {
                    if (command.includes('npm')) {
                        command = command
                            .replace(
                                `--require="${this.getMetricsPath(
                                    serviceInfo
                                )}"`,
                                ''
                            )
                            .replace(
                                'npm',
                                `npm --node-options --require="${this.getMetricsPath(
                                    serviceInfo
                                )}"`
                            );
                        addedStats = true;
                    } else if (command.includes('node')) {
                        command = command
                            .replace(
                                `--node-options --require="${this.getMetricsPath(
                                    serviceInfo
                                )}"`,
                                ''
                            )
                            .replace(
                                'node',
                                `${(yarnVersion >= 2 || config.yarnVersion >= 2) ? `yarn node` : 'node'} --require="${this.getMetricsPath(
                                    serviceInfo
                                )}"`
                            );
                        addedStats = true;
                    } else if (command.includes('yarn')) {
                        script = command
                            .replace(/ --[\w\d]+( |$)/g, '')
                            .replace(/ -[\w\d]+( |$)/g, '')
                            .replace(/ --[\w\d]+=[\w\d]+( |$)/g, '')
                            .replace(/ -[\w\d]+=[\w\d]+( |$)/g, '')
                            .replace(/ --[\w\d]+=('|")[\w\d]+('|")( |$)/g, '')
                            .replace(/ -[\w\d]+=('|")[\w\d]+('|")( |$)/g, '')
                            .replace('yarn', '')
                            .replace('run', '')
                            .trim();

                        if (!script.includes(' ')) {
                            const pkg = JSON.parse(
                                fs.readFileSync(managerFiles.pkg.host, 'utf-8')
                            );

                            if (pkg.scripts[script]) {
                                script = pkg.scripts[script];

                                if (
                                    !script.includes('nodemon') &&
                                    script.includes('node')
                                ) {
                                    command = script
                                        .replace('yarn ', '')
                                        .replace(
                                            'node',
                                            (yarnVersion >= 2 || config.yarnVersion >= 2)
                                                ? `yarn node --require="${this.getMetricsPath(
                                                    serviceInfo
                                                )}"`
                                                : `node --require="${this.getMetricsPath(
                                                    serviceInfo
                                                )}"`
                                        );
                                    addedStats = true;
                                }
                            }
                        }
                    }

                    if (addedStats) {
                        composeOptions.services[serviceName].command = command;

                        let statsPort = 9840;

                        composeOptions.services[serviceName].environment =
                            composeOptions.services[serviceName].environment ||
                            {};

                        composeOptions.services[
                            serviceName
                        ].environment.STATS_PORT = statsPort + nodeCount;

                        composeOptions.services[serviceName].ports =
                            composeOptions.services[serviceName].ports || [];

                        composeOptions.services[serviceName].ports.push(
                            `${statsPort + nodeCount}:${statsPort + nodeCount}`
                        );
                    }
                }

                const dir = packageManager === 'yarn' && yarnVersion >= 2 ? `./.yarn/cache` : getCacheDir(serviceInfo);


                composeOptions.services[serviceName].volumes = [
                    ...volumes.filter(
                        (vol) =>
                            (typeof vol === 'object' &&
                                !vol.target.includes('node_modules') &&
                                !vol.target.includes('.yarn')) ||
                            (typeof vol === 'string' &&
                                !vol.includes('node_modules') &&
                                !vol.includes('.yarn'))
                    ),
                    {
                        type: 'volume',
                        source: volumeName,
                        target:
                            serviceInfo.modulesDir ||
                            `${workingDir}/node_modules`,
                        volume: { nocopy: true },
                    },
                ];

                nodeCount++;
            }
        }

        if (files.fileExists(this.path)) {
            fs.unlinkSync(this.path);
        }

        let yaml = YAMLJS.stringify(composeOptions, 8);

        yaml = yaml.replace(/: null/g, ': ');

        fs.writeFileSync(this.path, yaml);

        return this.path;
    }

    getMetricsPath(service) {
        return `${service.modulesDir}/.dnv_scripts/dnv_metrics`;
    }
}

module.exports = DnvComposeFile;
