const fs = require('fs');
const os = require('os');
const path = require('path');
const YAMLJS = require('yamljs');

const { files } = require('../../files');
const { config } = require('../../config');

const { error } = require('../../text');

const { hashDeps } = require('../util');

const WIN32 = os.platform() === 'win32';

class ComposeParseHelpers {
    arrayToObj(array) {
        return array.reduce((prev, item) => {
            return {
                [item.split('=')[0].trim()]: item.split('=')[1].trim(),
                ...prev,
            };
        }, {});
    }

    getLockFile(packageManager = 'npm') {
        return packageManager === 'npm'
            ? 'package-lock.json'
            : packageManager === 'yarn'
                ? 'yarn.lock'
                : packageManager === 'pnpm'
                    ? 'pnpm-lock.yml'
                    : '';
    }

    getDotFile(packageManager = 'npm', yarnVersion = null) {
        if (packageManager === 'npm' || packageManager === 'pnpm') {
            return '.npmrc'
        } else if (packageManager === 'yarn') {

            if (yarnVersion < 2) {
                return '.yarnrc'
            } else {
                return '.yarnrc.yml';
            }
        }
    }

    testForNode(serviceOptions) {
        const command = Array.isArray(serviceOptions.command)
            ? serviceOptions.command.join(' ')
            : serviceOptions.command;

        return (
            (command &&
                (command.includes('node') ||
                    command.includes('npm') ||
                    command.includes('yarn') ||
                    command.includes('nest') ||
                    command.includes('next') ||
                    command.includes('meteor') ||
                    command.includes('pnpm'))) ||
            (serviceOptions.volumes &&
                serviceOptions.volumes.find((vol) => {
                    return (
                        (typeof vol === 'string' &&
                            vol.includes('node_modules')) ||
                        (typeof vol === 'object' &&
                            vol.target.includes('node_modules'))
                    );
                })) ||
            (serviceOptions.image && serviceOptions.image.includes('node'))
        );
    }

    addVolumePaths(df, volumes) {
        for (const volume of volumes) {
            let from = null;
            let to = null;

            if (typeof volume === 'string') {
                const split = volume.split(':');
                from = split[0];
                to = split[1];
            }

            if (typeof volume === 'object' && volume.target) {
                from = volume.source;
                to = volume.target;
            }

            if (from && (from.includes('/') || from.includes('.'))) {
                if (WIN32) {
                    const match = from.substr(0, 3).match(/\/[a-z]\//i);

                    if (match) {
                        let part = match[0].replace(/\//g, '');
                        from = from.replace(
                            match[0],
                            `${part.toUpperCase()}:/`
                        );
                    }
                }
                if (from) {

                    df.addPath(from, to);
                }
            } else if (to) {
                df.containerFS.push(to);
            }
        }
    }

    setManagerFiles(service, df, working_dir) {
        const managerFiles = { other: [] };

        const servicePaths = df.containerFS.filter(
            (cfs) => cfs && cfs.includes(working_dir)
        );

        let hasLockFile = false;

        for (const path of servicePaths) {
            if (path.includes(this.getLockFile(service.packageManager))) {
                const host = df.localLookup[path];
                if (fs.existsSync(host)) {
                    hasLockFile = true;
                }
                break;
            }
        }

        let pkgPaths = [];

        for (const path of servicePaths) {
            const host = df.localLookup[path];

            const lockFile = this.getLockFile(service.packageManager, service.yarnVersion);
            const dotFile = this.getDotFile(service.packageManager, service.yarnVersion);

            service.lockFile = lockFile;
            service.dotFile = dotFile;

            let found = false;

            if (path.includes(lockFile) && hasLockFile) {
                managerFiles.lockFile = {
                    host,
                    container: path,
                    modified: files.fileTime(host),
                };

                found = true;
            } else if (path.includes('package.json')) {
                managerFiles.pkg = {
                    host,
                    container: path,
                    modified: files.fileTime(host),
                    depsHash: hasLockFile ? '' : hashDeps(host),
                };
                found = true;
            } else if (path.includes(dotFile)) {
                managerFiles.dot = {
                    host,
                    container: path,
                    modified: files.fileTime(host),
                };
                found = true;
            }

            if (!found && path.includes(service.packageManager)) {
                pkgPaths.push(path);
            }
        }

        if (
            (managerFiles.dot &&
                managerFiles.dot.host.includes('.yarnrc.yml')) ||
            (service.yarnVersion >= 2 || config.yarnVersion >= 2)
        ) {
            for (const path of pkgPaths) {
                const host = df.localLookup[path];

                if (path.includes('.pnp.cjs') || path.includes('.pnp.js')) {
                    managerFiles.other.push({
                        host,
                        container: path,
                        basename: path.basename(host),
                    });
                }
            }
        }

        service.managerFiles = managerFiles;

        return service;
    }

    setModulesDir(service, working_dir) {
        const { managerFiles } = service;

        if (service.packageManager === 'yarn') {
            if (managerFiles.dot) {
                if (managerFiles.dot.host.includes('.yarnrc.yml')) {
                    const rcJson = YAMLJS.parse(
                        fs.readFileSync(managerFiles.dot.host, 'utf8')
                    );

                    if (rcJson.nodeLinker === 'node-modules') {
                        service.modulesDir = working_dir + '/node_modules';
                    } else {
                        service.modulesDir = working_dir + '/.yarn';
                    }
                } else {
                    const rc = fs
                        .readFileSync(managerFiles.dot.host, 'utf8')
                        .split('\n');

                    let match;

                    for (const line of rc) {
                        match = line.match(/modules-folder .+$/);
                        if (match) {
                            break;
                        }
                    }

                    if (match) {
                        const modPath = match[0].replace('modules-folder ', '');
                        const dir = path.basename(modPath);

                        if (modPath.includes('..')) {
                            let dots = (modPath.match(/\.\./g) || []).length;
                            let workdir = service.path;

                            while (dots) {
                                workdir = workdir.replace(
                                    path.basename(workdir),
                                    ''
                                );
                                dots--;
                            }

                            service.modulesDir = workdir + '/' + dir;
                        } else if (modPath.substr(0, 2) === './') {
                            service.modulesDir = working_dir + '/' + dir;
                        } else {
                            service.modulesDir = modPath;
                        }
                    } else {
                        service.modulesDir = working_dir + '/node_modules';
                    }
                }
            } else {
                service.modulesDir = working_dir + '/node_modules';
            }
        } else {
            service.modulesDir = working_dir + '/node_modules';
        }

        const upOne = working_dir.replace('/' + path.basename(working_dir), '');

        if (!service.modulesDir.includes(upOne)) {
            error(
                'DNV does not currently support project setups where node_modules is located outside of the working directory'
            );
            process.exit(0);
        }

        return service;
    }

    checkModulesDir(services) {
        let dirDiff = false;
        let modulesDir;

        for (const opts1 of Object.values(services)) {
            if (dirDiff) {
                break;
            }

            const { isNode: isNode1 } = opts1;
            if (isNode1) {
                modulesDir = opts1.modulesDir;

                for (const opts2 of Object.values(services)) {
                    const { isNode: isNode2 } = opts2;
                    if (isNode2) {
                        if (opts2.modulesDir !== modulesDir) {
                            dirDiff = true;
                            break;
                        }
                    }
                }
            }
        }

        if (!dirDiff) {
            for (const name of Object.keys(services)) {
                if (services[name].isNode) {
                    services[name].volumeName =
                        this.projectName + '_dnv_volume';
                }
            }
        }

        return services;
    }
}

module.exports = ComposeParseHelpers;
