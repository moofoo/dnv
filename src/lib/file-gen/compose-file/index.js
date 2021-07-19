const fs = require('fs');
const path = require('path');
const YAMLJS = require('yamljs');
const execa = require('execa');
const omit = require('lodash.omit');
const { files } = require('../../files');

const DockerFile = require('../docker-file');

const ComposeStatic = require('./static');

const aggregation = require('aggregation/es6');

const ComposeParseHelpers = require('./parse-helpers');

const { prepPath } = require('../util');

class ComposeFile extends aggregation(ComposeStatic, ComposeParseHelpers) {
    static getInstance(
        filename = 'docker-compose.yml',
        cwd = files.cwd,
        parse = true,
        projectName = null,
        externalVolume = false,
        yarnVersion = null
    ) {
        filename = path.basename(filename);

        cwd = prepPath(cwd);

        if (fs.existsSync(cwd + '/' + filename)) {
            const cf = new ComposeFile(
                filename,
                cwd,
                parse,
                projectName,
                externalVolume,
                yarnVersion
            );

            return cf;
        }

        return null;
    }

    hasInitTTY = true;

    projectName = '';

    services = {};

    serviceNames = [];

    nodeServiceNames = [];

    hasUser = false;

    constructor(
        filename = 'docker-compose.yml',
        cwd = files.cwd,
        parse = true,
        projectName = null,
        externalVolume = false,
        yarnVersion = null
    ) {
        super();

        this.filename = filename;
        this.cwd = cwd;
        this.path = cwd + '/' + filename;
        this.externalVolume = externalVolume;
        this.yarnVersion = yarnVersion;

        this.composeFileTime = files.fileTime(this.path);

        let content = this.configComposeFile({ cwd });

        if (!content) {
            content = fs.readFileSync(this.path, 'utf8');
        }

        this.json = YAMLJS.parse(content, 8); //jsyaml.load(this.content);

        this.projectName = projectName || files.getFormattedDir(cwd);

        if (this.json && parse) {
            this.parse(this.json);
        }
    }

    configComposeFile({ cwd = files.cwd }) {
        let output;

        try {
            output = execa.commandSync(`docker-compose config`, {
                cwd,
                stdio: 'pipe',
            });
        } catch (err) {
            return null;
        }

        if (output.stdout) {
            return output.stdout;
        }

        return null;
    }

    parse(json) {
        json = json || this.json;

        const { services } = this.json;

        const tmp = {};
        const serviceNames = [];
        const nameCounts = {};

        for (const [serviceName, serviceInfo] of Object.entries(services)) {
            let {
                build,
                environment,
                volumes,
                command,
                image,
                container_name,
                working_dir,
                init,
                tty,
            } = serviceInfo;

            environment = Array.isArray(environment)
                ? this.arrayToObj(environment)
                : environment || {};

            if (environment.COMPOSE_PROJECT_NAME) {
                this.projectName = environment.COMPOSE_PROJECT_NAME;
            }

            command = Array.isArray(command) ? command.join(' ') : command;

            serviceNames.push(serviceName);

            let service = { serviceName, compose: serviceInfo };

            let isNode = false;

            let hostPath;

            if (command && command.includes('npm')) {
                service.packageManager = 'npm';
            } else if (command && command.includes('yarn')) {
                service.packageManager = 'yarn';
            }

            service.yarnVersion = this.yarnVersion;

            if (!build) {
                isNode = this.testForNode(serviceInfo, serviceName);
            } else {
                let { context, dockerfile, args, target } = build;

                service.built = true;

                context = context || '.';

                dockerfile = dockerfile || 'Dockerfile';

                args = args || {};

                target = target || 'default';

                let df = DockerFile.getInstance(
                    dockerfile,
                    context,
                    args || {}
                );

                df.makeContainerFS();

                service.dockerfile = df.path;
                service.dockerfileTime = files.fileTime(df.path);

                const stage = df.stages[target];

                if (stage.user) {
                    service.user = stage.user;
                    this.hasUser = true;
                }

                image = image || stage.image;

                working_dir = working_dir || stage.workingDir;

                df.containerFS = df.containerFS || [];

                const wdLen = working_dir.length;

                df.containerFS.sort((a, b) => {
                    let diffA = a.length - wdLen;
                    let diffB = b.length - wdLen;
                    if (diffA < 0) diffA = Math.abs(diffA) + 100;
                    if (diffB < 0) diffB = Math.abs(diffB) + 100;
                    if (diffB <= diffA) {
                        return 1;
                    }
                    if (diffB === diffA) {
                        return 0;
                    }
                    return -1;
                });

                hostPath = df.localLookup[working_dir];

                service.path = hostPath;

                let dir = path.basename(hostPath);

                if (dir.includes('/')) {
                    dir = dir.replace(this.cwd + '/', '');
                }

                service.dir = dir;

                service.formattedDir = files.format(dir);
                service.shortPath = files.getShortPath(hostPath);

                service.volumeName =
                    this.projectName + '_' + serviceName + '_dnv_volume';

                if (image.includes('node')) {
                    isNode = true;
                } else {
                    isNode = this.testForNode(serviceInfo);
                }

                if (isNode) {
                    if (!service.packageManager && stage.packageManager) {
                        service.packageManager = stage.packageManager;
                    }

                    if (volumes) {
                        this.addVolumePaths(df, volumes);
                    }

                    service = this.setManagerFiles(service, df, working_dir);
                    service = this.setModulesDir(service, working_dir);
                }
            }

            if (isNode && (!init || !tty)) {
                this.hasInitTTY = false;
            }

            service.isNode = isNode;

            if (!nameCounts[serviceName]) {
                nameCounts[serviceName] = 1;
            }

            service.containerName =
                container_name ||
                `${this.projectName}_${serviceName}_${nameCounts[serviceName]}`;

            nameCounts[serviceName]++;

            if (isNode) {
                if (working_dir) {
                    service.workingDir = working_dir;
                    service.compose.working_dir = working_dir;
                }
            }

            if (image) {
                service.image = image;
                service.compose.image = image;

                if (image.includes('alpine')) {
                    service.shell = '/bin/sh';
                } else {
                    service.shell = '/bin/bash';
                }
            }

            tmp[serviceName] = service;
        }

        this.services = this.checkModulesDir(tmp);

        this.serviceNames = serviceNames;

        this.nodeServiceNames = serviceNames.filter(
            (sname) => this.services[sname].isNode
        );

        this.nodeContainers = this.nodeServiceNames.map(
            (sname) => this.services[sname].containerName
        );
    }

    updateConfig(config = {}) {
        config.services = Object.keys(this.services).reduce((acc, curr) => {
            return {
                ...acc,
                [curr]: omit(this.services[curr], ['compose']),
            };
        }, {});
        config.serviceNames = this.serviceNames;
        config.nodeServiceNames = this.nodeServiceNames;
        config.nodeContainers = this.nodeContainers;
        config.composeFileTime = this.composeFileTime;
        config.projectName = this.projectName;
        return config;
    }

    checkDockerFiles() {
        const { services } = this.json;

        let dockerfilesFound = false;

        let output = {
            valid: true,
            invalidServices: [],
        };

        for (const [name, service] of Object.entries(services)) {
            let { build } = service;

            if (build) {
                let { context, dockerfile } = build;

                context = context || '.';
                dockerfile = (dockerfile || 'Dockerfile').replace('./', '');

                context = prepPath(context);

                if (!fs.existsSync(`${context}/${dockerfile}`)) {
                    output.valid = false;
                    output.invalidServices.push(name);
                } else {
                    dockerfilesFound = true;
                }
            }
        }

        if (!dockerfilesFound) {
            output.valid = false;
        }

        return output;
    }
}

module.exports = ComposeFile; //aggregation(ComposeParseHelpers, ComposeFile);
