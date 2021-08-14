const fs = require('fs');
const execa = require('execa');
const stripAnsi = require('strip-ansi');

const {
    createPackageVolume,
    removePackageVolume,
    removeVolume,
    createVolume,
} = require('./volumes');
const { removeContainer, getContainerStateSync } = require('./containers');
const { files } = require('../files');
const { config } = require('../config');
const { color } = require('../ui/blessed/util/prettify');

const shellExec = async ({
    shell = 'sh',
    opts = {},
    flags = '',
    container = '',
    cmd = '',
    onData = null,
}) => {
    const state = getContainerStateSync(container);

    if (state.exists && state.running) {
        opts = { ...(opts || {}), shell: true, stdio: 'pipe' };

        const subprocess = execa(
            'docker',
            ['exec', '-u=root', flags, container, shell, '-c', `"${cmd}"`],
            opts
        );

        if (onData) {
            subprocess.stdout.on('data', onData);
        }

        await subprocess;
    }
};

const dockerRun = ({
    workingDir = '/usr/src/app',
    mountFlag = '',
    flags = '--rm -i -d',
    container = 'dnv_container',
    image = 'node:15.5',
    volume = '',
}) => {
    return new Promise(async (resolve) => {
        const state = getContainerStateSync(container);

        if (!state.exists) {
            const cmd = `docker run -u=root ${flags} --name ${container} ${mountFlag} -w ${workingDir} -v ${volume}:${workingDir} ${image}`;


            try {
                await execa.command(cmd, { stdio: 'pipe' });
            } catch {
                resolve(false);

            }

            resolve(true);
        }
        resolve(false);
    });
};

const copySync = (file, container, path = '/usr/src/app') => {
    execa.commandSync(`docker cp ${file} ${container}:${path}`);
};

const copyAsync = (file, container, path = '/usr/src/app') => {
    return execa.command(`docker cp ${file} ${container}:${path}`);
};

const copyAll = async (files, container, path = '/usr/src/app ') => {
    await Promise.all(files.map((file) => copyAsync(file, container, path)));
};

/*
    The goal here is to create an external volume that just contains
    the -contents- of the node_modules directory, so that when we mount it
    to a working directory, that path in the container will just contain the
    dependency folders (not a node_modules folder containing dependencies)

    populateAndInstall steps:
        1. Create volume and mount it on a temp container, with the container WORKDIR and
        external volume path set to the project's node_modules path (so, something like /usr/src/app/node_modules)
        2. Also bind mount host dependencies cache directory at this time, if using NPM or yarn pre v2 (for yarn, only mount cache
           if there are no dependencies that need to force installed, because yarn doesn't have a friggin --force option or equivalent
        3. Copy package.json / lock files / dot files etc to the container
        4. Move all the files up one directory.
        5. Change to that directory and run the install
        6. Delete the installation files (this is important - that path is going to have a bind mount (project root on the host),
           so it needs to be empty or there will be a conflict)
*/

const populateAndInstall = ({
    service,
    projectName,
    nodeContainers,
    optsInstall,
    progressMsg,
    useCache = true,
    retry = false,
    uiStats,
    verbose = false,
}) => {
    return new Promise(async (resolve, reject) => {
        let {
            managerFiles,
            volumeName,
            shortPath,
            packageManager,
            diff,
            path: cwd,
            workingDir,
            image,
            lockFile,
            dotFile,
            modulesDir,
            serviceName,
            yarnVersion
        } = service;

        workingDir = modulesDir || `${workingDir}/node_modules`;

        if (!managerFiles.lockFile) {
            lockFile = false;
        }

        if (!managerFiles.dot) {
            dotFile = false;
        }

        let yarn2 = false;

        if (
            packageManager === 'yarn' &&
            ((managerFiles.dot &&
                managerFiles.dot.host.includes('.yarnrc.yml')) ||
                yarnVersion >= 2 || config.yarnVersion >= 2)
        ) {
            yarn2 = true;
        }

        if (yarn2) {
            useCache = false;
        }

        const projectConfig = config.getProjectConfig(true);

        let newlyCreated;
        let mountFlag = '';

        let forceInstall =
            optsInstall || projectConfig.populateFailed === null || false;

        let forceInstallPreCmd = '';
        let forceInstallCmd = '';
        let forceInstalls = [];
        const toForceInstall = [];

        const pkgJson = JSON.parse(
            fs.readFileSync(managerFiles.pkg.host, 'utf-8')
        );
        const pathKey = projectConfig.pathKey;

        const configForceInstall = [...(projectConfig.forceInstall || [])];

        let forceInstallDeps = configForceInstall
            .filter((fi) => fi.enabled === true)
            .map((fi) => fi.value);


        const forceInstallMap = configForceInstall.reduce((acc, curr) => {
            return {
                ...acc,
                [curr.value]: curr,
            };
        }, {});

        forceInstallDeps.sort((a, b) => {
            if (b == 'node-gyp') {
                return -1;
            }
            return 0;
        });

        const pkgDeps = Object.keys(pkgJson.dependencies);

        let container = `${projectName}_dnv_container`;

        const printProgress = (txt) => {
            progressMsg(
                color(`${shortPath} ${serviceName} - ${txt}`, serviceName)
            );
        };

        /*
            Make sure we start with a clean slate, docker-wise
        */

        await removeContainer(container, true);

        if (projectConfig.populateFailed || retry) {
            forceInstall = true;
        }

        if (projectConfig.populateFailed && !retry) {
            for (const nodeContainer of nodeContainers) {
                await removeContainer(nodeContainer);
            }
        }

        if (projectConfig.populateFailed || retry || optsInstall) {
            try {
                await removeVolume(volumeName);
            } catch { }
        }

        try {
            newlyCreated = await createVolume(volumeName);

            if (newlyCreated) {
                config.setProjectConfigProp(pathKey, 'execItems', {});
                config.setProjectConfigProp(pathKey, 'recentItems', {});

            }

            if (projectConfig.populateFailed || retry || optsInstall || newlyCreated) {
                config.setServiceProp(pathKey, serviceName, 'newVolume', true);
            }

            /*
                 Mount host's dependencies cache in container
            */
            if (
                useCache &&
                (packageManager === 'npm' ||
                    (packageManager === 'yarn' && !yarn2))
            ) {
                const configCommand =
                    packageManager === 'yarn'
                        ? 'yarn cache dir'
                        : 'npm config get cache';

                const { stdout: cacheDir } = execa.commandSync(configCommand, {
                    stdio: 'pipe',
                });

                mountFlag = `--mount type=bind,src=${cacheDir},dst=/usr/packagecache`;
            }

            let findForced = false;

            if (newlyCreated) {
                printProgress(`Created Volume ${volumeName}`);
                findForced = true;
            } else {
                printProgress(`Volume ${volumeName} Present`);

                if (diff) {
                    printProgress(`Lock file changed`);
                    findForced = true;
                } else {
                    printProgress(`Lock file unchanged`);
                }
            }

            const doingInstall = newlyCreated || diff || forceInstall;



            if (doingInstall) {
                /*
                    Get dependencies to force install (ones that depend on node-gyp, for example)
                */
                if (findForced) {
                    const devDeps = Object.keys(pkgJson.devDependencies || {});
                    const peerDeps = Object.keys(
                        pkgJson.peerDependencies || {}
                    );
                    if (yarn2) {
                        forceInstalls = [];
                        for (const dep of forceInstallDeps) {
                            let json;
                            try {
                                output = execa.commandSync(
                                    `yarn why ${dep} -R --json`,
                                    {
                                        stdio: 'pipe',
                                    }
                                );
                                if (output.stdout) {
                                    json = JSON.parse(output.stdout);
                                }
                            } catch { }

                            if (json) {
                                if (!pkgDeps.includes(dep)) {
                                    forceInstalls.push(dep);
                                }
                            }
                        }
                    } else {
                        forceInstalls =
                            (await files.findDeps(forceInstallDeps, cwd)) || [];
                    }

                    if (forceInstalls.length) {
                        forceInstalls = Array.from(new Set([...forceInstalls]));

                        forceInstalls.forEach((pkg) => {
                            const enabled = forceInstallMap[pkg]
                                ? forceInstallMap[pkg].enabled
                                : true;

                            if (
                                !configForceInstall.find(
                                    (cfi) => cfi.value === pkg
                                )
                            ) {
                                configForceInstall.push({
                                    value: pkg,
                                    enabled,
                                });
                            }

                            if (enabled) {
                                toForceInstall.push(pkg);

                                if (packageManager === 'npm') {
                                    forceInstallCmd += ` && ${packageManager} install ${pkg} --force`;

                                    if (devDeps.includes(pkg)) {
                                        forceInstallCmd += ' --save-dev';
                                    } else if (peerDeps.includes(pkg)) {
                                        forceInstallCmd += ' --save-peer';
                                    }
                                } else if (
                                    packageManager === 'yarn' &&
                                    !yarn2
                                ) {
                                    forceInstallCmd += ` && ${packageManager} add ${pkg}`;

                                    if (devDeps.includes(pkg)) {
                                        forceInstallCmd += ' --dev';
                                    } else if (peerDeps.includes(pkg)) {
                                        forceInstallCmd += ' --peer';
                                    }

                                    forceInstallPreCmd += ` && yarn remove ${pkg}`;
                                } else if (yarn2 && !newlyCreated) {
                                    forceInstallPreCmd += ` && yarn rebuild ${pkg}`;
                                }
                            }
                        });

                        if (
                            toForceInstall.length &&
                            packageManager === 'yarn' &&
                            !yarn2
                        ) {
                            mountFlag = '';
                        }

                        config.setProjectConfigProp(
                            pathKey,
                            'forceInstall',
                            configForceInstall
                        );
                    }
                }

                /*
                    Create container to populate the external volume.
                    WORKDIR of container and mount path of volume are the same.
                */

                const dockerRan = await dockerRun({
                    container,
                    image,
                    workingDir,
                    mountFlag,
                    volume: volumeName,
                });

                if (!dockerRan) {
                    throw new Error('Volume container didnt start');
                }

                if (useCache && mountFlag !== '') {
                    printProgress('Bind mounting host cache');
                }

                /*
                    Copy package manager files to container
                */
                const manFiles = Object.values(managerFiles)
                    .map((mFile) =>
                        Array.isArray(mFile)
                            ? mFile.map((sFile) => sFile.host)
                            : mFile.host
                    )
                    .flat();

                await copyAll(manFiles, container, workingDir);

                if (yarn2 && newlyCreated) {
                    if (fs.existsSync(`${cwd}/.yarn/releases/yarn-berry.cjs`)) {
                        await shellExec({
                            container,
                            cmd: `mkdir -p ${modulesDir}/releases`,
                        });

                        copySync(
                            `${cwd}/.yarn/releases/yarn-berry.cjs`,
                            container,
                            modulesDir + '/releases'
                        );
                    } else {
                        throw new Error(
                            'Could not find ./.yarn/releases/yarn-berry.cjs'
                        );
                    }

                    if (fs.existsSync(`${cwd}/.yarn/install-state.gz`)) {
                        copySync(
                            `${cwd}/.yarn/install-state.gz`,
                            container,
                            modulesDir
                        );
                    }

                    if (fs.existsSync(`${cwd}/.yarn/cache`)) {
                        await shellExec({
                            container,
                            cmd: `mkdir -p ${modulesDir}/cache`,
                        });
                        copySync(`${cwd}/.yarn/cache`, container, modulesDir);
                    }
                }

                /*
                    Create the install command
                */
                let shortCommand =
                    newlyCreated &&
                        packageManager === 'npm' &&
                        managerFiles.lockFile
                        ? 'npm ci'
                        : packageManager === 'npm'
                            ? 'npm install'
                            : `${packageManager} install`;

                let install = '';

                const npmFlags =
                    '--update-notifier=false --progress=false --fund=false --audit=false --color=false --strict-ssl=false --prefer-offline=true';

                const yarnFlags = yarn2
                    ? ''
                    : useCache && toForceInstall.length
                        ? '--non-interactive --force'
                        : '--non-interactive';

                install =
                    newlyCreated &&
                        packageManager === 'npm' &&
                        managerFiles.lockFile
                        ? `npm ci ${npmFlags}`
                        : packageManager === 'yarn'
                            ? `${packageManager} install ${yarnFlags}`
                            : `${packageManager} install ${npmFlags}`;

                if (useCache && mountFlag !== '') {
                    install +=
                        packageManager === 'yarn'
                            ? ' --cache-folder /usr/packagecache'
                            : ' --cache=/usr/packagecache';
                }

                /*
                    Copy manager files up a directory.
                */
                let cmd = `cp package.json ../ && rm package.json`;

                if (lockFile) {
                    cmd += ` && cp ${lockFile} ../ && rm ${lockFile}`;
                }

                if (dotFile) {
                    cmd += ` && cp ${dotFile} ../ && rm ${dotFile}`;
                }

                if (managerFiles.others) {
                    for (const other of managerFiles.others) {
                        const { basename } = other;

                        cmd += ` && cp ${basename} ../ && rm ${basename}`;
                    }
                }

                /*
                    Move up a directory and run install
                */
                cmd += ' && cd ..';

                if (newlyCreated && yarn2 && forceInstalls.length) {
                    printProgress(
                        `Force installing ${forceInstalls.join(', ')}`
                    );
                    for (const fi of forceInstalls) {
                        cmd += ` && yarn add ${fi}`;
                    }
                }

                if (forceInstallPreCmd) {
                    cmd += forceInstallPreCmd;
                }

                cmd += install !== '' ? ` && ${install}` : '';

                if (verbose) {
                    printProgress(`Running ${install}`);
                } else {
                    printProgress(`Running ${shortCommand}`);
                }

                if (!yarn2 && forceInstallCmd !== '') {
                    printProgress(
                        `Force installing ${toForceInstall.join(', ')}`
                    );
                    cmd += forceInstallCmd;
                }

                cmd += ` && rm package.json`;

                if (lockFile) {
                    cmd += ` && rm ${lockFile}`;
                }

                if (dotFile) {
                    cmd += ` && rm ${dotFile}`;
                }

                if (managerFiles.others) {
                    for (const other of managerFiles.others) {
                        const { basename } = other;

                        cmd += ` && rm ${basename}`;
                    }
                }

                const start = new Date().getTime();

                await shellExec({
                    container,
                    cmd,
                    onData: (data) => {
                        data = data
                            .toString()
                            .split('\n')
                            .filter((val) => {
                                val = stripAnsi(val);
                                if (val.trim() === '') {
                                    return false;
                                }
                                if (yarn2) {
                                    if (val.includes('step')) {
                                        return true;
                                    } else {
                                        return false;
                                    }
                                } else if (
                                    val.includes(
                                        'success Uninstalled packages'
                                    ) ||
                                    val.includes('success Saved ') ||
                                    val.includes('Done in ') ||
                                    val.includes('success Saved lockfile') ||
                                    val.includes('yarn install ') ||
                                    val.includes('yarn remove') ||
                                    val.includes('yarn add ') ||
                                    val.includes('├─') ||
                                    val.includes('└─') ||
                                    val.includes('info') ||
                                    (val.includes('[') && val.includes(']'))
                                ) {
                                    return false;
                                } else {
                                    return true;
                                }
                            })
                            .map((val) => val.replace(/┌/g, ''))
                            .forEach((line) => printProgress(line));
                    },
                });

                /*

            Initially, the plan was to store the metrics server JS file up a directory from the Node Service's
            WORKDIR, and use node --require to make it work.

            However, Node will insist it's not there at first, and will only see the file
            after the container goes through two or more full start / shutdown (not kill) / start cycles. Weird.

            In any case, I ended up sticking it in node_modules in a .dot directory
            (meaning it won't be deleted by NPM, and it's reasonably out of the way)
            */

                if (
                    (newlyCreated ||
                        optsInstall ||
                        projectConfig.populateFailed === null) &&
                    uiStats.includes(serviceName)
                ) {
                    await shellExec({
                        container,
                        cmd: 'mkdir -p .dnv_scripts',
                    });

                    copySync(
                        __dirname + '/dnv_scripts/dnv_metrics.js',
                        container,
                        modulesDir + '/.dnv_scripts' ||
                        `${workingDir}/node_modules/.dnv_scripts`
                    );
                }

                /*
                    Remove container now that we're finished populating the external volume
                */
                await removeContainer(container, true);

                const elapsed = `${(
                    (new Date().getTime() - start) /
                    1000
                ).toFixed(2)}s`;

                printProgress(`Done in ${elapsed}`);
            }
        } catch (err) {
            config.setProjectConfigProp(pathKey, 'populateFailed', true);
            config.delete(`projectConfigs.${pathKey}.usersSetup`);

            await removeContainer(container, true);

            for (const containerName of nodeContainers) {
                await removeContainer(containerName);
            }

            await removeVolume(volumeName);

            if (
                err.stderr &&
                err.stderr.includes('Windows.UI.Notifications.ToastNotifier')
            ) {
                if (!retry) {
                    printProgress(`Random windows failure. trying it again`);

                    return await populateAndInstall({
                        service,
                        projectName,
                        nodeContainers,
                        forceInstallDeps,
                        optsInstall,
                        progressMsg,
                        useCache,
                        retry: true,
                    });
                } else {
                    reject(
                        'dnv up failed: random windows failure. try running dnv up/ui again'
                    );
                }
            }

            reject(err);
            return;
        }

        config.setProjectConfigProp(pathKey, 'populateFailed', false);

        resolve(true);
    });
};

const dnvDown = ({ externalVolume = false, name = '', cwd = files.cwd }) => {
    let cmd = 'docker-compose';

    if (externalVolume) {
        cmd += ' -f docker-compose-dnv-gen.yml';
    }

    if (name) {
        cmd += ` -p ${name}`;
    }

    cmd += ' down --volumes --remove-orphans';

    try {
        execa.commandSync(cmd, { cwd, stdio: 'pipe' });
    } catch { }
};

const dnvBuild = async ({
    cwd = files.cwd,
    removeOrphans = true,
    file = [],
    externalVolume = false,
    progress = console.log,
    buildCmd = null,
    newBuild = false,
}) => {
    if (!externalVolume && !!buildCmd && !!newBuild) {
        progress('Building Image(s)...');
        await execa.command(buildCmd, {
            cwd,
            stdio: 'pipe',
        });

        return;
    }

    let command = `docker-compose`;

    if (file.length) {
        command += ` -f ${file.join(' ')}`;
    }

    command += ` up ${removeOrphans ? '--remove-orphans' : ''}`;

    if (!!buildCmd && !newBuild) {
        progress(`Re-Building Images ${buildCmd}`);
        await execa.command(
            command + ` --no-start --build --renew-anon-volumes ${buildCmd}`,
            {
                stdio: 'pipe',
                cwd,
            }
        );
    }
};

const dnvUpDetached = async function ({
    cwd = files.cwd,
    removeOrphans = true,
    file = [],
    projectName = null,
    externalVolume = false,
    progress = console.log,
    noRecreate = false
}) {
    if (externalVolume) {
        file.unshift('docker-compose-dnv-gen.yml');
    }

    let command = `docker-compose`;

    if (externalVolume && projectName) {
        command += ` -p ${projectName}`;
    }

    if (Array.isArray(file) && file.length) {
        command += ' -f ' + file.join(' -f ');
    }

    command += ` up --detach ${removeOrphans ? '--remove-orphans' : ''}`;

    if (noRecreate) {
        command += ' --no-recreate';
    }
    try {
        const subprocess = execa.command(command, {
            cwd,
            stdio: 'pipe',
            all: true
        });

        let pullLogged = [];

        subprocess.all.on('data', data => {
            data = data.toString();

            let m = data.match(/[a-zA-Z]+ Pulling/);

            if (m) {
                m = m[0].trim();
                if (m.replace(" Pulling", "").length > 2) {

                    if (!pullLogged.includes(m)) {
                        pullLogged.push(m);
                        progress(m);
                    }
                }
            }


        });

        await subprocess;

    } catch (err) {
        const msg = 'Windows.UI.Notifications.ToastNotifier';
        const msg2 = ': network';
        if (
            (typeof err === 'string' && err.includes(msg)) ||
            (err.stderr && err.stderr.includes(msg)) ||
            (err.message && err.message.includes(msg))
        ) {
            progress('Rando windows failure, trying again...');
            try {
                execa.commandSync(command, {
                    cwd,
                    stdio: 'pipe',
                });
            } catch (err) {
                throw new Error(err);
            }

            return true;
        } else if (
            (typeof err === 'string' && err.includes(msg2)) ||
            (err.stderr && err.stderr.includes(msg2)) ||
            (err.message && err.message.includes(msg2))
        ) {
            progress('Network error, trying with --force-recreate...');
            const projectConfig = config.getProjectConfig(true);
            const pathKey = projectConfig.pathKey;
            config.setProjectConfigProp(pathKey, 'execItems', {});
            config.setProjectConfigProp(pathKey, 'recentItems', {});

            try {
                execa.commandSync(command + ' --force-recreate', {
                    cwd,
                    stdio: 'pipe',
                });
            } catch (err) {
                throw new Error(err);
            }

            return true;
        } else {
            throw new Error(err);
        }
    }

    return true;
};

const dnvUp = async ({
    stdio = 'inherit',
    cwd = files.cwd,
    removeOrphans = true,
    progress = console.log,
    file = [],
    projectName = '',
    externalVolume = false,
    noRecreate = false
}) => {
    if (externalVolume) {
        file.unshift('docker-compose-dnv-gen.yml');
    }

    let command = `docker-compose`;

    if (externalVolume && projectName) {
        command += ` -p ${projectName}`;
    }

    if (Array.isArray(file) && file.length) {
        command += ' -f ' + file.join(' -f ');
    }

    command += ` up ${removeOrphans ? '--remove-orphans' : ''}`;

    if (noRecreate) {
        command += ' --no-recreate';
    }

    let subprocess;

    try {
        subprocess = execa.command(command, {
            cwd,
            stdio,
        });

        await subprocess;
    } catch (err) {
        if (
            (typeof err === 'string' &&
                err.includes('Windows.UI.Notifications.ToastNotifier')) ||
            (err.stderr &&
                err.stderr.includes('Windows.UI.Notifications.ToastNotifier'))
        ) {
            progress('Rando windows failure, trying again...');
            try {
                subprocess = execa.command(command, {
                    cwd,
                    stdio,
                });

                await subprocess;
            } catch (err) {
                if (err.stderr) {
                    throw new Error(err.stderr);
                }

                throw new Error(err);
            }
        }

        if (err.stderr) {
            throw new Error(err.stderr);
        }

        throw new Error(err);
    }
};

const serviceShell = async ({
    externalVolume = false,
    shell = 'sh',
    flags = '--rm',
    cwd = files.cwd,
    projectName = '',
    service = '',
    composeFile = 'docker-compose-dnv-gen.yml',
}) => {
    let cmd = `docker-compose`;

    if (externalVolume) {
        if (projectName) {
            cmd += ` -p ${projectName}`;
        }

        if (composeFile) {
            cmd += ` -f ${composeFile}`;
        }
    }

    cmd += ` run ${flags} ${service} ${shell}`;

    await execa.command(cmd, {
        cwd,
        stdio: 'inherit',
    });
};

module.exports = {
    populateAndInstall,
    dnvUp,
    dnvUpDetached,
    dnvBuild,
    dnvDown,
    serviceShell,
    copySync,
};
