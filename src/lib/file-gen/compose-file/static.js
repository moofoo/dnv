const fs = require('fs');
const path = require('path');
const YAMLJS = require('yamljs');

const { listContainers } = require('../../docker/containers');
const { error } = require('../../text');
const { prepPath, hashDeps } = require('../util');
const { files } = require('../../files');
const { config } = require('../../config');

class ComposeStatic {
    static cache = {};

    static exists(filename = 'docker-compose.yml', cwd = files.cwd) {
        cwd = prepPath(cwd);
        const path = cwd + '/' + filename;
        if (fs.existsSync(path)) {
            return path;
        }

        return false;
    }

    static validate(composeFile) {
        const filename = path.basename(composeFile);
        const cwd = composeFile.replace(filename, '');

        let output;

        try {
            output = execa.commandSync(`docker-compose -f ${filename} config`, {
                cwd: cwd,
                stdio: 'pipe',
            });
        } catch (err) {
            output = err;
        }

        let msg = '';

        if (output.failed) {
            msg = `${chalk.bold.red(`Validation Error in ${filename}`)}\n`;
            msg += output.stderr;
        } else {
            msg = output.stdout;
        }

        return {
            valid: !output.failed,
            msg,
        };
    }

    static checkFiles(cf) {
        const validated = {
            composeChanged: false,
            dockerfileChange: false,
            composeFile: null,
            dockerfiles: [],
        };

        let serviceNames = [...cf.serviceNames];

        if (!fs.existsSync(cf.path)) {
            error(cf.path + ' missing');
            process.exit(0);
        } else if (cf.composeFileTime !== files.fileTime(cf.path)) {
            validated.composeChanged = true;

            validated.composeFile = ComposeStatic.validate(cf.path);

            const json = YAMLJS.parse(
                fs.readFileSync(cf.path, { encoding: 'utf-8' })
            );

            serviceNames = Object.keys(json.services);
        } else {
            validated.composeFile = {
                valid: true,
            };
        }

        for (const name of serviceNames) {
            const serviceInfo = cf.services[name];

            if (!serviceInfo) {
                validated.dockerfileChange = true;
                continue;
            }

            const { isNode, dockerfile, dockerfileTime } = serviceInfo;

            if (isNode) {
                if (!fs.existsSync(dockerfile)) {
                    error(dockerfile + ' missing');
                    process.exit(0);
                } else if (dockerfileTime !== files.fileTime(dockerfile)) {
                    validated.dockerfileChange = true;

                    validated.dockerfiles.push(
                        ComposeStatic.validate(dockerfile)
                    );
                }
            }
        }

        return validated;
    }

    static getDiff(cf) {
        const diff = { serviceChange: false, services: {} };

        let newTime;

        for (const [serviceName, serviceOptions] of Object.entries(
            cf.services
        )) {
            let { isNode, managerFiles, workingDir, lockFile, dotFile, path } =
                serviceOptions;

            let serviceDiff = false;

            if (isNode) {
                let hasLock = !!managerFiles.lockFile;

                if (!hasLock) {
                    if (fs.existsSync(path + '/' + lockFile)) {
                        managerFiles.lockFile = {
                            host: path + '/' + lockFile,
                            container: workingDir + '/' + lockFile,
                            modified: null,
                            newModified: files.fileTime(path + '/' + lockFile),
                        };

                        serviceDiff = true;
                    }
                } else {
                    newTime = files.fileTime(managerFiles.lockFile.host);

                    if (newTime !== managerFiles.lockFile.modified) {
                        managerFiles.lockFile.newModified = newTime;
                        serviceDiff = true;
                    }
                }

                if (!managerFiles.dot) {
                    if (fs.existsSync(path + '/' + dotFile)) {
                        managerFiles.dot = {
                            host: path + '/' + dotFile,
                            container: workingDir + '/' + dotFile,
                            modified: null,
                            newModified: files.fileTime(path + '/' + dotFile),
                        };

                        serviceDiff = true;
                    }
                } else {
                    newTime = files.fileTime(managerFiles.dot.host);

                    if (newTime !== managerFiles.dot.modified) {
                        managerFiles.dot.newModified = newTime;
                        serviceDiff = true;
                    }
                }

                newTime = files.fileTime(managerFiles.pkg.host);

                if (newTime !== managerFiles.pkg.modified) {
                    managerFiles.pkg.newModified = newTime;

                    if (!serviceDiff && !hasLock) {
                        const newHash = hashDeps(managerFiles.pkg.host);

                        if (newHash !== managerFiles.pkg.depsHash) {
                            managerFiles.pkg.depsHash = newHash;
                            serviceDiff = true;
                        }
                    }
                }
            }

            if (serviceDiff) {
                diff.serviceChange = true;
                diff.services[serviceName] = true;
            } else {
                diff.services[serviceName] = false;
            }

            cf.services[serviceName].managerFiles = managerFiles;
        }

        return diff;
    }

    static async getState(cf, dnvComposeFile) {
        if (!cf.services) {
            throw new Error('No services passed to ComposeFile.getState');
        }

        const services = cf.services;

        let dnv;

        if (dnvComposeFile) {
            dnv = YAMLJS.parse(fs.readFileSync(dnvComposeFile, 'utf-8'));
        }

        const containers =
            cf.nodeContainers ||
            Object.values(services)
                .filter((service) => service.isNode)
                .map((service) => service.containerName);

        const list = await listContainers(containers);

        const creatingContainers = [];

        let allUp = true;

        for (const [name, info] of Object.entries(services)) {
            if (dnv) {
                services[name].env = dnv.services[name].environment;
            }

            let containerExists = true;
            if (list.length === 0) {
                containerExists = false;
            } else {
                const container = list.find((data) => {
                    return data.Names[0].includes(info.containerName);
                });

                if (container) {
                    services[name].containerId = container.Id;

                    const containerCreated = container.Created;

                    services[name].created = String(containerCreated).includes(
                        '-'
                    )
                        ? new Date(container.Created).getTime() / 1000
                        : containerCreated;

                    services[name].created = Number(
                        services[name].created
                    ).toFixed(0);

                    services[name].crashed = false;

                    if (
                        container.state.exitCode === 1 &&
                        container.state.error !== ''
                    ) {
                        services[name].crashed = true;
                    }

                    services[name].started = container.StartedAt - 5;

                    if (container.State === 'running') {
                        services[name].up = true;
                    } else {
                        services[name].up = false;
                        allUp = false;
                    }
                } else {
                    containerExists = false;
                }
            }

            if (!containerExists) {
                allUp = false;
                creatingContainers.push(info.containerName);
                services[name].up = false;
                services[name].newContainer = true;
                services[name].created = (new Date().getTime() / 1000).toFixed(
                    0
                );
            } else {
                services[name].newContainer = false;
            }
        }

        cf.allUp = allUp;

        return cf;
    }

    static createGenericCompose({
        workingDir,
        packageManager,
        multiRepo,
        dockerfiles,
        composeFile,
        cwd = files.cwd,
        yarnVersion,
    }) {
        yarnVersion = yarnVersion || config.yarnVersion;

        let command;

        if (packageManager === 'pnpm') {
            command = `pnpm run start`;
        } else if (packageManager === 'yarn') {
            command = `yarn run start`;
        } else {
            command = `npm run start --update-notifier=false`;
        }

        composeFile = files.getFullFile(composeFile, cwd);

        const rootDir = files.format(
            path.basename(
                composeFile.replace('/' + path.basename(composeFile), '')
            )
        );

        const networkName = `${rootDir}_defnet`;

        let json = {
            services: {},
        };

        for (const info of dockerfiles) {
            let dockerfile = info.dockerfile;
            const dir = info.dir;
            const formatted = info.formatted;

            const serviceName = formatted; // multiRepo ? formatted : `node_service`;

            const volumes = [
                multiRepo ? `./${dir}:${workingDir}` : `.:${workingDir}`,
            ];

            if (packageManager === 'yarn' && config.yarnVersion >= 2) {
                volumes.push(`${workingDir}/.yarn`);
            } else {
                volumes.push(`${workingDir}/node_modules`);
            }

            let build = {
                context: '.',
            };

            dockerfile = files.getRelativeFile(dockerfile, cwd);

            const dockerfileName = dockerfile.substr(
                dockerfile.lastIndexOf('/') + 1
            );

            if (dockerfile !== `./${dockerfileName}`) {
                build.context = dockerfile.replace(`/${dockerfileName}`, '');
                build.dockerfile = dockerfileName;
            }

            json.services[serviceName] = {
                init: true,
                tty: true,
                build,
                volumes,
                command,
                networks: [networkName],
            };
        }

        json = {
            networks: {
                [networkName]: null,
            },
            ...json,
        };

        let yaml = YAMLJS.stringify(json, 8);

        yaml = yaml.replace(/: null/g, ': ');

        fs.writeFileSync(composeFile, yaml);

        return composeFile;
    }

    static addInitTTY(composeFile = 'docker-compose.yml', cwd = files.cwd) {
        cwd = prepPath(cwd);
        composeFile = cwd + '/' + path.basename(composeFile);
        if (fs.existsSync(composeFile)) {
            const content = fs.readFileSync(composeFile, 'utf8');

            const json = YAMLJS.parse(content);

            for (const name of Object.keys(json.services)) {
                json.services[name].init = true;
                json.services[name].tty = true;
            }

            let yaml = YAMLJS.stringify(json, 8);

            yaml = yaml.replace(/: null/g, ': ');

            fs.writeFileSync(composeFile, yaml);
        }
    }
}

module.exports = ComposeStatic;
