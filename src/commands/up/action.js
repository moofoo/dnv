const chalk = require('chalk');
const difference = require('lodash.difference');
const pWaterfall = require('p-waterfall');
const cloneDeep = require('lodash.clonedeep');
const stripAnsi = require('strip-ansi');
const execa = require('execa');
const fs = require('fs');

const {
    populateAndInstall,
    dnvUp,
    dnvUpDetached,
    dnvBuild,
} = require('../../lib/docker/cli');
const { config } = require('../../lib/config');

const { error, info } = require('../../lib/text');
const { stopContainer } = require('../../lib/docker/containers');
const watch = require('../../lib/watcher');

const { getContainerStateSync } = require('../../lib/docker/containers');

const ComposeFile = require('../../lib/file-gen/compose-file');
const DnvComposeFile = require('../../lib/file-gen/dnv-compose-file');

const { color } = require('../../lib/ui/blessed/util/prettify');

const { files } = require('../../lib/files');

function IsJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const checkAndValidateFiles = (opts) => {
    if (!opts.dnvui) {
        opts.progressMsg('Validating Docker Files');
    }

    const { composeFile, composeFileTime, services } = opts;

    const jsonFail = [];

    for (const service of Object.values(services)) {
        if (service.managerFiles && service.managerFiles.pkg) {
            const json = fs.readFileSync(
                service.managerFiles.pkg.host,
                'utf-8'
            );
            if (!IsJsonString(json)) {
                jsonFail.push(service.shortPath + '/' + 'package.json');
            }
        }
    }

    if (jsonFail.length) {
        for (const fail of jsonFail) {
            error(`${fail} does not appear to be valid JSON`);
        }
        process.exit(0);
    }

    const output = ComposeFile.checkFiles({
        path: composeFile,
        composeFileTime,
        services,
        serviceNames: Object.keys(services),
    });

    opts.composeChanged = output.composeChanged;
    opts.dockerfileChange = output.dockerfileChange;

    if (!output.composeFile.valid) {
        console.error(output.composeFile.msg);
        process.exit(1);
    }

    for (const dockerfile of output.dockerfiles) {
        if (!dockerfile.valid) {
            console.error(dockerfile.msg);
            process.exit(1);
        }
    }

    return opts;
};

const optionProcessing = async (opts) => {
    let {
        allUiServices,
        uiServices,
        uiScrollback,
        dnvComposeFile,
        progressMsg,
        pathKey,
        composeFile,
        services,
        path,
        newComposeFileTime,
        composeFileTime,
        composeNodeImage,
        composeChanged,
        dockerfileChange,
        populateFailed,
        uiStats,
        externalVolume,
        name: projectName,
        install,
        recreateYml,
    } = opts;

    let yarnVersion;

    for (const service of Object.values(services)) {
        if (service.yarnVersion > 0) {
            yarnVersion = service.yarnVersion;
            break;
        }
    }

    if (populateFailed === true || populateFailed === null) {
        config.setProjectConfigProp(pathKey, 'execItems', {});
        config.setProjectConfigProp(pathKey, 'recentItems', {});
    }

    uiScrollback = opts.scrollback || uiScrollback;

    if (opts.since) {
        opts.since = opts.since.trim();

        if (
            !/\d+ns|\d+us|\d+s|\d+m|\d+h/.test(opts.since) &&
            !/[0-9]{1,4}\/[0-9]{1,2}\/[0-9]{1,2} [0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}/.test(
                opts.since
            ) &&
            !/^(\d+)-(0[1-9]|1[012])-(0[1-9]|[12]\d|3[01])\s([01]\d|2[0-3]):([0-5]\d):([0-5]\d|60)(\.\d+)?(([Zz])|([\+|\-]([01]\d|2[0-3])))$/.test(
                opts.since
            )
        ) {
            progressMsg(error('Invalid value provided for --since', false));
            return;
        }
    }

    const diff = ComposeFile.getDiff({
        path: composeFile,
        composeFileTime,
        services,
    });

    let dnvExists = false;

    if (externalVolume) {
        dnvExists = DnvComposeFile.exists(dnvComposeFile || '', path);
    }

    const regen =
        recreateYml === true ||
        !!newComposeFileTime ||
        install ||
        populateFailed === null ||
        composeChanged ||
        dockerfileChange ||
        diff.serviceChange ||
        (!dnvExists && externalVolume);

    const cf = regen
        ? ComposeFile.getInstance(
              composeFile,
              path,
              true,
              projectName,
              externalVolume,
              yarnVersion
          )
        : opts;

    opts.hasUser = cf.hasUser;

    cf.serviceNames = cf.serviceNames || allUiServices;

    cf.nodeContainers =
        cf.nodeContainers ||
        Object.values(cf.services)
            .filter((service) => service.isNode)
            .map((service) => service.containerName);

    opts.nodeContainers = cf.nodeContainers;

    cf.nodeServiceNames =
        cf.nodeServiceNames ||
        Object.values(cf.services)
            .filter((service) => service.isNode)
            .map((service) => service.serviceName);

    const projectConfig = config.getProjectConfig(true);

    if (externalVolume && regen) {
        if (composeNodeImage && composeNodeImage !== 'dockerfile') {
            for (const [name, info] of Object.entries(cf.services)) {
                if (info.isNode) {
                    cf.services[name].image = composeNodeImage;
                    cf.services[name].compose.image = composeNodeImage;
                }
            }
        }

        const dnv = DnvComposeFile.getInstance(
            dnvComposeFile,
            composeFile,
            path,
            cf,
            projectName
        );

        dnv.create(
            composeNodeImage === 'dockerfile' ? null : composeNodeImage,
            uiStats
        );

        projectConfig.recreateYml = false;
    }

    if (externalVolume && dnvExists && (regen || opts.nosync)) {
        const output = ComposeFile.validate(dnvComposeFile);

        if (!output.valid) {
            console.error(output.msg);
            process.exit(0);
        }
    }

    if (regen) {
        opts = cf.updateConfig(opts);
    }

    projectConfig.services = cloneDeep(opts.services);
    projectConfig.composeFileTime = opts.composeFileTime;
    projectConfig.hasUser = opts.hasUser;

    opts = await ComposeFile.getState(
        opts,
        externalVolume ? dnvComposeFile : null
    );

    const dnvServices = opts.serviceNames;

    opts.servicesChanged = false;

    let servicesChanged = false;

    if (allUiServices.length !== dnvServices.length) {
        servicesChanged = true;
    }

    if (!servicesChanged) {
        if (
            difference(dnvServices, allUiServices).length ||
            difference(allUiServices, dnvServices).length
        ) {
            servicesChanged = true;
        }
    }

    if (servicesChanged) {
        if (
            externalVolume &&
            uiStats.length &&
            config.get('defaultConfig.uiStats')
        ) {
            uiStats = uiStats || [];
            dnvServices.forEach((service) => {
                if (!allUiServices.includes(service)) {
                    if (opts[service].isNode && !uiStats.includes(service)) {
                        uiStats.push(service);
                    }
                }
            });

            projectConfig.uiStats = uiStats;
        }

        opts.servicesChanged = true;
        progressMsg('Services Changed');
        uiServices = dnvServices;
        opts.uiServices = uiServices;
        opts.allUiServices = uiServices;

        projectConfig.uiServices = uiServices;
        projectConfig.allUiServices = uiServices;
    }

    config.set(`projectConfigs.${pathKey}`, projectConfig);

    for (const [name, info] of Object.entries(opts.services)) {
        if (info.isNode) {
            if (diff.services[name] === undefined) {
                opts.services[name].diff = true;
            } else {
                opts.services[name].diff = diff.services[name];
            }
        }

        if (uiServices.includes(name)) {
            opts.services[name].show = true;
        } else {
            opts.services[name].show = false;
        }
    }

    return opts;
};

const setupServiceSince = async (opts) => {
    let { uiSince, services, progressMsg } = opts;

    const statuses = {};

    for (const [name, info] of Object.entries(services)) {
        statuses[info.serviceName] = info.status;

        if (opts.since) {
            services[name].prepSince = opts.since;
            services[name].since = '3s';
        } else {
            services[name].since = '3s';

            if (!info.newContainer) {
                if (uiSince === 'created') {
                    services[name].prepSince = 0;
                } else if (uiSince === 'started') {
                    if (info.up) {
                        services[name].prepSince = info.started;
                    }
                } else if (uiSince === 'docker') {
                    if (info.up) {
                        services[name].prepSince = 0;
                    } else if (info.crashed) {
                        services[name].prepSince = info.started - 10;
                    }
                } else {
                    services[name].prepSince = uiSince;
                }
            }
        }

        if (opts.install) {
            await stopContainer(info.containerName);
        }
    }

    opts.services = services;
    opts.statuses = statuses;

    return opts;
};

const checkBuild = async (opts) => {
    const { externalVolume, services, install } = opts;

    if (externalVolume) {
        opts.buildCmd = null;
        return opts;
    }

    let output;

    output = await execa.command('docker-compose images -q', {
        cwd: files.cwd,
        stdio: 'pipe',
    });

    const stdout =
        ((output.stdout && stripAnsi(output.stdout).trim()) || '') +
        ((output.stderr && stripAnsi(output.stderr).trim()) || '');

    if (stdout === '') {
        opts.buildCmd = `docker-compose build --parallel `;
        opts.newBuild = true;
        return opts;
    } else {
        opts.buildCmd = '';
        opts.newBuild = false;
    }

    const diffServices = [];

    for (const [name, service] of Object.entries(services)) {
        if (
            service.built &&
            (install || service.diff || service.newContainer)
        ) {
            diffServices.push(name);
        } else if (
            Object.values(service.managerFiles).find(
                (file) =>
                    file.newModified !== undefined && file.newModified !== null
            )
        ) {
            diffServices.push(name);
        }
    }

    if (diffServices.length) {
        opts.buildCmd += `${diffServices.join(' ')}`;
    } else {
        opts.buildCmd = null;
    }

    return opts;
};

const runBuild = async (opts) => {
    let {
        progressMsg,
        removeOrphans,
        buildCmd,
        newBuild,
        externalVolume,
        pathKey,
    } = opts;

    buildCmd = buildCmd || null;

    if (!externalVolume && (buildCmd || newBuild)) {
        if (!config.isOnline) {
            throw new Error('Not online. quitting');
        }

        config.setProjectConfigProp(pathKey, 'execItems', {});
        config.setProjectConfigProp(pathKey, 'recentItems', {});

        try {
            await dnvBuild({
                progress: progressMsg,
                removeOrphans,
                externalVolume,
                buildCmd,
                newBuild,
            });
        } catch (err) {
            config.setProjectConfigProp(pathKey, 'populateFailed', null);
            throw new Error(err);
        }

        opts.execItems = {};
    }

    return opts;
};

const recordUpdate = () => {
    const projectConfig = config.getProjectConfig(true);

    if (projectConfig.newComposeFileTime) {
        projectConfig.composeFileTime = projectConfig.newComposeFileTime;
        projectConfig.newComposeFileTime = null;
    }

    for (const service of Object.values(projectConfig.services)) {
        const { managerFiles, isNode } = service;

        if (!isNode) {
            continue;
        }

        for (const data of Object.values(managerFiles)) {
            if (data.newModified) {
                data.modified = data.newModified;
                data.newModified = null;
            }
        }
    }

    config.set(`projectConfigs.${projectConfig.pathKey}`, projectConfig);
};

const populateVolumeAndInstallDependences = async (opts) => {
    return new Promise((resolve) => {
        let {
            pathKey,
            name: projectName,
            progressMsg,
            nodeContainers,
            dir: projectDir,
            services,
            install: optsInstall,
            nodeServiceNames,
            uiStats,
            externalVolume,
        } = opts;

        if (!externalVolume) {
            resolve(opts);
            return;
        }

        /*
            These timeouts are just so blessed displays progress msgs as a nice sequence instead
            of all at once when loading the DNV UI
        */
        setTimeout(async () => {
            let populated = true;

            try {
                for (const nodeService of nodeServiceNames) {
                    const service = services[nodeService];

                    populated = await populateAndInstall({
                        service,
                        projectName,
                        projectDir,
                        nodeContainers,
                        optsInstall,
                        progressMsg,
                        uiStats,
                    });

                    if (!populated) {
                        break;
                    }
                }
            } catch (err) {
                config.setProjectConfigProp(pathKey, 'populateFailed', true);
                if (opts.dnvui) {
                    throw new Error(err);
                }

                if (typeof err === 'object') {
                    if (err.message) {
                        progressMsg(error(err.message, false));
                    } else {
                        progressMsg(error(err.stderr, false));
                    }
                } else {
                    progressMsg(error(err, false));
                }
                process.exit(1);
            }

            if (!populated) {
                config.setProjectConfigProp(pathKey, 'populateFailed', true);
                progressMsg('something went wrong');
                process.exit(1);
            }

            resolve(opts);
        });
    });
};

const setupNodeUser = (opts) => {
    return new Promise(async (resolve) => {
        const {
            services,
            hasUser,
            dnvComposeFile,
            name: projectName,
            usersSetup,
            pathKey,
            externalVolume,
            progressMsg,
        } = opts;

        if (externalVolume && hasUser && usersSetup === undefined) {
            const userServices = Object.values(services)
                .filter((service) => service.user && service.isNode)
                .map((service) => service.serviceName);

            await execa.command(
                `docker-compose -p ${projectName} -f ${dnvComposeFile} up --detach ${userServices.join(
                    ' '
                )}`,
                {
                    stdio: 'pipe',
                }
            );

            let notRunning = false;

            setTimeout(async () => {
                for (const serviceName of userServices) {
                    const service = services[serviceName];

                    const { workingDir, modulesDir, containerName, user } =
                        service;

                    let cmd = `chown ${user} -R ${workingDir}`;

                    if (!modulesDir.includes(workingDir)) {
                        cmd += ` && chown ${user} -R ${modulesDir}`;
                    }

                    const state = getContainerStateSync(containerName);

                    if (!state.running) {
                        notRunning = true;
                        break;
                    }

                    await execa.command(
                        `docker exec -u=root ${containerName} sh -c "${cmd}"`,
                        {
                            shell: true,
                            stdio: 'pipe',
                        }
                    );
                }

                await execa.command(
                    `docker-compose -p ${projectName} -f ${dnvComposeFile} stop`,
                    {
                        cwd: files.cwd,
                        stdio: 'pipe',
                    }
                );

                if (notRunning) {
                    resolve(opts);
                }

                opts.usersSetup = true;

                config.setProjectConfigProp(pathKey, 'usersSetup', true);
            }, 1500);
        }

        resolve(opts);
    });
};

const initWatchFiles = (opts) => {
    let { services, progressMsg, watchFiles, watchIgnore } = opts;

    if (1 === 1) {
        return opts;
    }

    watchIgnore = !watchIgnore
        ? []
        : Object.values(watchIgnore)
              .map((wi) => wi.enabled && wi.value)
              .filter((val) => val);

    if (
        (watchFiles && !Array.isArray(watchFiles)) ||
        (Array.isArray(watchFiles) && watchFiles.length)
    ) {
        const watchedMsg = [];

        for (const [serviceName, serviceInfo] of Object.entries(services)) {
            if (
                serviceInfo.isNode &&
                (watchFiles === true ||
                    (Array.isArray(watchFiles) &&
                        watchFiles.includes(serviceName)))
            ) {
                if (
                    watch(serviceInfo, [
                        ...watchIgnore,
                        ...Object.values(serviceInfo.managerFiles)
                            .map((file) => file.host)
                            .filter((val) => val),
                    ])
                ) {
                    serviceInfo.watching = true;
                    watchedMsg.push(color(serviceInfo.shortPath, serviceName));
                }
            }
        }

        if (watchedMsg.length) {
            progressMsg(chalk.whiteBright('Watching ') + watchedMsg.join(', '));
        }
    }

    return opts;
};

const runUpAndAttach = async (opts) => {
    let {
        name: projectName,
        progressMsg,
        removeOrphans,
        uiServices,
        externalVolume,
        services,
        detach,
        nodeContainers,
        quit,
    } = opts;

    recordUpdate();

    if (quit) {
        return;
    }

    if (detach) {
        try {
            dnvUpDetached({
                progress: progressMsg,
                projectName,
                removeOrphans,
                nodeContainers,
                services,
                externalVolume,
            });
        } catch (err) {
            reject(err);
        }
    } else {
        await dnvUp({
            progress: progressMsg,
            projectName,
            opts: '',
            attach: true,
            removeOrphans,
            uiServices,
            externalVolume,
            detach,
        });
    }
};

const upAction = async (opts) => {
    if (!config.isProjectConfigSet()) {
        error('Project not initialized');
        process.exit(0);
    }

    const projectConfig = {
        ...cloneDeep(config.getProjectConfig(true)),
        progressMsg: info,
        ...opts,
    };

    const tasks = [
        checkAndValidateFiles,
        optionProcessing,
        setupServiceSince,
        checkBuild,
        populateVolumeAndInstallDependences,
        setupNodeUser,
        runBuild,
        initWatchFiles,
        runUpAndAttach,
    ];

    await pWaterfall(tasks, projectConfig);
};

module.exports = {
    upAction,
    checkAndValidateFiles,
    optionProcessing,
    setupServiceSince,
    checkBuild,
    populateVolumeAndInstallDependences,
    setupNodeUser,
    initWatchFiles,
    runBuild,
    recordUpdate,
};