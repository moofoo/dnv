const ansiEscapes = require('ansi-escapes');
const execa = require('execa');
const chalk = require('chalk');
const debounce = require('lodash.debounce');
const os = require('os');
const blessed = require('./blessed');

const { config } = require('../config');

const {
    restartContainer,
    getContainerStateSync,
} = require('../docker/containers');

const { prettify, chalkSubStr } = require('./blessed/util/prettify');
const containerEventStream = require('./blessed/util/event-stream');

const {
    createDnvGroup,
    killDnvProcesses,
    getPackageScripts,
    getShellScripts,
    getNpmGlobalInstalls,
    getYarnV1GlobalInstalls,
    getAlpineInstallsAfterDate,
    getAptInstallsAfterDate,
    getReadmeString,
    getDependencies,
} = require('./blessed/util/exec');

const UI = require('./blessed/layouts/ui');
const Grid = require('./blessed/layouts/grid');

const {
    ShellTerminal,
    ProgramTerminal,
    MarkdownTerminal,
    LogTerminal,
} = require('./blessed/widgets/terminal');

const Stats = require('./blessed/widgets/stats');

const help = require('./blessed/other/display-help');
const ContainerOpts = require('./blessed/prompts/container-opts');
const closePrompt = require('./blessed/prompts/exit-prompt');
const CmdList = require('./blessed/prompts/cmd-list');
const WatchingList = require('./blessed/prompts/watching-list');
const Panel = require('./blessed/layouts/panel');
const Manager = require('./blessed/prompts/file-manager');

const multiplex = async (projectConfig, services, stop, screen, scrollback) => {
    let mouseDisabled = false;
    screen.program.enableMouse();

    process.on('beforeExit', () => {
        if (screen && screen.program && mouseDisabled === false) {
            screen.program.disableMouse();
        }
    });

    screen.program.setMode(1);

    screen.program.setMouse(screen.options.mouseOpts, true);

    let {
        name: projectName,
        execEnvironment,
        pathKey,
        composeNodeImage,
        uiStats,
        packageManager,
        uiReplDeps,
        uiReplDevDeps,
        dnvComposeFile,
        externalVolume,
    } = projectConfig;

    uiStats =
        packageManager === 'yarn' && config.yarnVersion > 2 ? [] : uiStats;

    // The defaults here are TERM=xterm-256color and LC_ALL=C.UTF-8
    // LC_ALL=C.UTF-8 is particularly important for getting unicode to display correctly.
    // C.UTF-8 is universally supported (I think) and does the trick.

    execEnvironment = (execEnvironment || [])
        .filter((env) => {
            return env.enabled;
        })
        .map((env) => {
            return env.value;
        });

    let items = [];
    const containerService = {};

    /*
    items.push({
        termType: 'base',
        prettyprint: true,
        widget: BaseTerm,
        key: 'debug',
        label: 'debug',
        style: {
            fg: 'white',
            bg: 'black',
        },
    });
    */

    const getWatchCount = () => {
        let watchingCount = 0;
        let watchingShort = [];

        Object.keys(services).forEach((name) => {
            if (
                services[name].watching &&
                !watchingShort.includes(services[name].shortPath)
            ) {
                watchingCount++;
                watchingFiles = true;
                watchingShort.push(services[name].shortPath);
            }
        });

        return watchingCount;
    };

    let watchingFiles = false;

    let cName;

    Object.keys(services).forEach((name) => {
        if (services[name].watching) {
            watchingFiles = true;
        }

        if (services[name].show) {
            containerService[services[name].containerName] =
                services[name].serviceName;
        }

        const state = getContainerStateSync(services[name].containerName);

        services[name].running = state.running;
    });

    const helperText = (whole, part) => {
        return chalkSubStr(
            chalk.whiteBright,
            chalk.hex('#f59324').bold,
            whole,
            part
        );
    };

    // Creating a group (dnv) and adding root to it, then using that user:group whenever we exec in a container,
    // so we have a means to clean up the processes we create on exit
    Promise.all(
        Object.values(services).map((info) =>
            createDnvGroup(info.shell, info.containerName)
        )
    );

    let cleanProcs = false;

    let restarting = false;

    for (const info of Object.values(services)) {
        if (!info.show) {
            continue;
        }

        const shell = info.shell;

        let short = info.shell === '/bin/bash' ? 'bash' : 'sh';

        info.id = `${Math.floor(Math.random() * (9999 - 1001) + 1000)}`;

        items.push({
            widget: Panel,
            key: info.serviceName,
            tabLabel: info.serviceName,
            service: info,
            items: {
                main: {
                    id: info.id,
                    widget: LogTerminal,
                    label: info.serviceName,
                    key: info.serviceName,
                    cursorBlink: false,
                    hideCursor: true,
                    pty: false,
                    scrollback,
                    termType: 'process',
                    processType: 'log',
                    ignore: [
                        `${info.containerName} kill`,
                        `${info.containerName} restart`,
                    ],
                    format: (data, item) =>
                        prettify(info.serviceName, data, item),
                    command: {
                        prep:
                            info.prepSince !== undefined
                                ? `docker container logs -t --since=${info.prepSince} ${info.containerName}`
                                : null,

                        start: `docker container logs -f -t --since=${
                            info.since || '5s'
                        } ${info.containerName}`,
                        restart: () => {
                            const { startedAt } = getContainerStateSync(
                                info.containerName
                            );

                            return `docker container logs -f -t --since=${
                                new Date(startedAt).getTime() / 1000 - 5
                            } ${info.containerName}`;
                        },
                    },
                    lineState: {
                        active: {
                            default: info.running,
                            on: `${info.containerName} start`,
                            off: [
                                `${info.containerName} stop`,
                                `${info.containerName} kill`,
                                `${info.containerName} die`,
                            ],
                        },
                    },
                    help: {
                        keys: {
                            'C-a': helperText('Actions', 'A'),
                            'C-s': helperText('Search', 'S'),
                            'C-f': helperText('Filter', 'F'),
                            'C-p': helperText('Copy', 'p'),
                            'C-l': helperText('Clear', 'l'),
                        },
                    },
                },
            },
            actions: {
                'C-a': (item, panel) => {
                    let panelActive = true;

                    if (
                        item.userClose ||
                        item.closing ||
                        item.restarting ||
                        restarting
                    ) {
                        return;
                    }

                    if (
                        info.running === false ||
                        !panel.mainItem ||
                        !panel.mainItem.lineState ||
                        (panel.mainItem &&
                            panel.mainItem.lineState &&
                            !panel.mainItem.lineState.active)
                    ) {
                        panelActive = false;
                    }

                    let containerItems = [];

                    const recentItems =
                        (config.get(`projectConfigs.${pathKey}`).recentItems ||
                            {})[info.serviceName] || [];

                    if (panelActive) {
                        containerItems = [short];

                        if (recentItems.length) {
                            containerItems.push('recent');
                        }

                        containerItems.push('exec');

                        if (info.isNode) {
                            containerItems.push('repl');
                        }

                        containerItems.push('scripts');

                        if (info.isNode) {
                            if (
                                !panel.containerDisabled.includes('metrics') &&
                                uiStats &&
                                uiStats.includes(info.serviceName) &&
                                info.env &&
                                info.env.STATS_PORT
                            ) {
                                containerItems.push('metrics');
                            }
                        }
                    }

                    if (info.isNode) {
                        containerItems.push('readme');
                    }

                    if (item.options.processType === 'log') {
                        containerItems.push('restart');
                    }

                    if (watchingFiles) {
                        containerItems.push(
                            `watching ${getWatchCount()} path(s)`
                        );
                    }

                    panel.switching = true;

                    const containerOpts = new ContainerOpts({
                        positionParent: item,
                        parent: screen,
                        screen: screen,
                        panel,
                        subPanel: item,
                        items: containerItems,
                        subLists: ['exec', 'scripts', 'readme', 'recent'],
                        width: 21,
                        height: 10,
                        action: async (selected) => {
                            if (!selected) {
                                return;
                            }

                            if (!panel) {
                                return;
                            }

                            if (selected.includes('watching ')) {
                                containerOpts.switching = true;

                                const watchOpts = new WatchingList({
                                    debug: panel.parent.debug,
                                    label: 'Watching for changes',
                                    positionParent: item,
                                    parent: screen,
                                    screen: screen,
                                    panel,
                                    subPanel: item,
                                    services,
                                    action: (serviceNames, updateList) => {
                                        if (serviceNames && updateList) {
                                            serviceNames.forEach(
                                                (serviceName) => {
                                                    if (
                                                        services[serviceName]
                                                            .watching
                                                    ) {
                                                        services[
                                                            serviceName
                                                        ].watching = false;
                                                    } else {
                                                        services[
                                                            serviceName
                                                        ].watching = true;
                                                    }
                                                }
                                            );

                                            updateList(services);
                                        }
                                    },
                                });
                            } else if (selected === 'readme') {
                                containerOpts.switching = true;
                                const depOpts = new CmdList({
                                    label: 'Open Package Readme',
                                    disabled: panel.readmeOpen || [],
                                    positionParent: item,
                                    parent: screen,
                                    screen: screen,
                                    panel,
                                    subPanel: item,
                                    categories: true,
                                    categoryColors: {
                                        prod: 'green',
                                        dev: 'yellow',
                                    },
                                    action: async (name, cmd, shell) => {
                                        const str = await getReadmeString(
                                            cmd,
                                            info.path
                                        );

                                        panel.initItem(name, {
                                            packageName: cmd,
                                            termType: 'markdown',
                                            key: info.serviceName,
                                            widget: MarkdownTerminal,
                                            label: name,
                                            border: null,
                                            contentString: str,
                                            help: {
                                                keys: {
                                                    'C-a': helperText(
                                                        'Actions',
                                                        'A'
                                                    ),
                                                    'C-s': helperText(
                                                        'Search',
                                                        'S'
                                                    ),
                                                    'C-p': helperText(
                                                        'Copy',
                                                        'p'
                                                    ),
                                                    'C-e': helperText(
                                                        'Sections',
                                                        'e'
                                                    ),
                                                },
                                            },
                                            actions: {
                                                'C-e': (term) => {
                                                    const sectionList =
                                                        new CmdList({
                                                            startSelection:
                                                                term.lastSection,
                                                            label: 'Sections',
                                                            positionParent:
                                                                term,
                                                            parent: screen,
                                                            screen: screen,
                                                            panel,
                                                            subPanel: term,
                                                            width: '65%',
                                                            height: '100%-3',
                                                            itemAlign: 'left',
                                                            action: (
                                                                name,
                                                                cmd,
                                                                shell,
                                                                category,
                                                                hasArgs,
                                                                index
                                                            ) => {
                                                                term.goToSection(
                                                                    name,
                                                                    cmd
                                                                );
                                                                term.lastSection =
                                                                    index;
                                                            },
                                                            itemOpts: [
                                                                async () => {
                                                                    return term.listItems;
                                                                },
                                                            ],
                                                        });

                                                    if (
                                                        term.lastSection !==
                                                        undefined
                                                    ) {
                                                        process.nextTick(() => {
                                                            sectionList.select(
                                                                term.lastSection
                                                            );
                                                        });
                                                    }
                                                },
                                            },
                                        });
                                    },
                                    itemOpts: [
                                        async () => {
                                            return getDependencies(info.path);
                                        },
                                    ],
                                });
                            } else if (selected === 'repl') {
                                if (!panelActive) {
                                    return;
                                }

                                const deps =
                                    config.get(`projectConfigs.${pathKey}`)
                                        .uiReplDeps[info.serviceName] || [];

                                const devDeps =
                                    uiReplDevDeps[info.serviceName] || [];

                                const replDeps = [...deps, ...devDeps];

                                const node =
                                    os.platform() === 'win32'
                                        ? 'node.exe'
                                        : 'node';

                                const script =
                                    __dirname
                                        .replace(/^[A-Z]:\\/, '/')
                                        .replace(/\\/g, '/') +
                                    '/blessed/util/repl/index.js';

                                let command = `${node} --interactive --experimental-repl-await ${script} --service ${info.serviceName}`;

                                if (replDeps.length) {
                                    command +=
                                        ' --loadDeps ' +
                                        replDeps.join(' --loadDeps ');
                                }

                                panel.initItem('repl', {
                                    service: info.serviceName,
                                    loadDeps: replDeps,
                                    widget: ShellTerminal,
                                    pty: true,
                                    shellName: 'REPL',
                                    shellType: 'repl',
                                    label: 'REPL',
                                    border: null,
                                    hideCursor: false,
                                    termType: 'shell',
                                    cursorBlink: true,
                                    command,
                                    help: {
                                        keys: {
                                            'C-a': helperText('Actions', 'A'),
                                            'C-s': helperText('Search', 'S'),
                                            'C-p': helperText('Copy', 'p'),
                                            'C-e': helperText('Editor', 'E'),
                                            'C-l': helperText('Load', 'L'),
                                            'C-y': helperText('Display', 'y'),
                                        },
                                    },
                                    actions: {
                                        'C-l': (term) => {
                                            new Manager({
                                                debug: term.parent.debug.bind(
                                                    term.parent
                                                ),
                                                screen,
                                                parent: screen,
                                                positionParent: term,
                                                subPanel: term,
                                                panel,
                                                path: info.path,
                                                action: (node) => {
                                                    term.setScrollPerc(100);
                                                    term.pty.write('\r');
                                                    term.pty.write(
                                                        `.load ${node.relativePath}`
                                                    );
                                                    term.pty.write('\r');
                                                },
                                            });
                                        },
                                        'C-y': (term) => {
                                            new Manager({
                                                debug: term.parent.debug.bind(
                                                    term.parent
                                                ),
                                                screen,
                                                parent: screen,
                                                positionParent: term,
                                                subPanel: term,
                                                path: info.path,
                                                action: function (node) {
                                                    term.setScrollPerc(100);
                                                    this.pty.write('\r');
                                                    this.pty.write(
                                                        `.display ${node.relativePath}`
                                                    );
                                                    this.pty.write('\r');
                                                }.bind(term),
                                            });
                                        },

                                        'C-e': (term) => {
                                            term.setScrollPerc(100);
                                            term.pty.write('\r');
                                            term.pty.write(`.editor`);
                                            term.pty.write('\r');
                                        },
                                    },
                                });
                            } else if (selected === 'restart') {
                                restarting = true;
                                panel.mainItem.popover = false;
                                panel.activeItem.popover = false;

                                await restartContainer(info.containerName);

                                setTimeout(() => {
                                    const state = getContainerStateSync(
                                        info.containerName
                                    );
                                    info.running = state.running;
                                    restarting = false;
                                }, 500);
                            } else if (selected === short) {
                                if (!panelActive) {
                                    return;
                                }

                                cleanProcs = true;

                                const command = `docker exec -it -e ${execEnvironment.join(
                                    ' -e '
                                )} -u=root:dnv ${info.containerName} ${shell}`;

                                panel.initItem(short, {
                                    key: info.serviceName,
                                    widget: ShellTerminal,
                                    shellName: short,
                                    label: short,
                                    border: null,
                                    pty: true,
                                    hideCursor: false,
                                    command,
                                    termType: 'shell',
                                    cursorBlink: true,
                                    watchTerm: info.id,
                                    addToRecent: (cmd) => {
                                        const items =
                                            (config.get(
                                                `projectConfigs.${pathKey}`
                                            ).recentItems || {})[
                                                info.serviceName
                                            ] || [];

                                        if (
                                            items.find((item) => {
                                                return item.cmd === cmd;
                                            })
                                        ) {
                                            return;
                                        }

                                        items.unshift({
                                            cmd,
                                            name: cmd,
                                            prog: cmd,
                                            shell,
                                        });

                                        if (items.length > 10) {
                                            items.pop();
                                        }

                                        config.setProjectConfigProp(
                                            pathKey,
                                            'recentItems',
                                            {
                                                [info.serviceName]: items,
                                            }
                                        );
                                    },
                                    inputAction: [
                                        {
                                            matchOne: [
                                                'yarn',
                                                'pnpm',
                                                'npm',
                                                'apt',
                                                'apk',
                                            ],
                                            global: true,
                                            match: ' add | install | i | del | unintall | remove | purge| rm | r | un | unlink ',
                                            fn: (term) => {
                                                config.setProjectConfigProp(
                                                    pathKey,
                                                    'execItems',
                                                    {}
                                                );
                                            },
                                        },
                                    ],
                                    help: {
                                        keys: {
                                            'C-a': helperText('Actions', 'A'),
                                            'C-s': helperText('Search', 'S'),
                                            'C-p': helperText('Copy', 'p'),
                                        },
                                    },
                                });
                            } else if (selected === 'exec') {
                                if (!panelActive) {
                                    return;
                                }

                                let execItems =
                                    (config.get(`projectConfigs.${pathKey}`)
                                        .execItems || {})[info.serviceName] ||
                                    [];

                                const execOpts = new CmdList({
                                    label: 'Exec',
                                    positionParent: item,
                                    parent: screen,
                                    screen: screen,
                                    panel,
                                    subPanel: item,
                                    debug: panel.debug,
                                    fromCache: execItems,
                                    categories: true,
                                    categoryColors: {
                                        npm: 'red',
                                        yarn: 'blue',
                                        apt: 'yellow',
                                        apk: 'green',
                                    },
                                    filterItems: (items) => {
                                        return items.filter((item) => {
                                            if (
                                                item.name.includes('python') &&
                                                item.name !== 'python' &&
                                                item.name !== 'python3'
                                            ) {
                                                return false;
                                            }

                                            return true;
                                        });
                                    },
                                    cacheItems: (items) => {
                                        if (items.length) {
                                            config.setProjectConfigProp(
                                                pathKey,
                                                'execItems',
                                                {
                                                    [info.serviceName]: items,
                                                }
                                            );
                                        }
                                    },

                                    action: (
                                        name,
                                        cmd,
                                        shell,
                                        category,
                                        hasArgs
                                    ) => {
                                        if (
                                            name === 'Nothing found' ||
                                            name === 'No apps found'
                                        ) {
                                            execOpts.destroy();
                                            return;
                                        }

                                        cleanProcs = true;

                                        let command = `docker exec -it -e ${execEnvironment.join(
                                            ' -e '
                                        )} -u=root:dnv ${info.containerName}`;

                                        if (hasArgs || cmd.includes(' ')) {
                                            command += ` ${shell} -c ''${cmd}''`;
                                        } else {
                                            command += ` ${cmd}`;
                                        }

                                        panel.initItem(name, {
                                            key: info.serviceName,
                                            widget: ProgramTerminal,
                                            shellName: short,
                                            watchTerm: info.id,
                                            name,
                                            label: name,
                                            border: null,
                                            pty: true,
                                            hideCursor: false,
                                            command,
                                            commandHasArgs: hasArgs,
                                            termType: 'program',
                                            help: {
                                                keys: {
                                                    'C-a': helperText(
                                                        'Actions',
                                                        'A'
                                                    ),
                                                    'C-p': helperText(
                                                        'Copy',
                                                        'p'
                                                    ),
                                                },
                                            },
                                            lineState: {
                                                execFailed: {
                                                    noState: true,
                                                    fn: (line) => {
                                                        if (
                                                            line.includes(
                                                                'OCI runtime exec failed'
                                                            )
                                                        ) {
                                                            config.setProjectConfigProp(
                                                                pathKey,
                                                                'execItems',
                                                                {}
                                                            );
                                                        }
                                                    },
                                                },
                                            },
                                        });
                                    },
                                    itemOpts: [
                                        async () => {
                                            if (!info.isNode) {
                                                return [];
                                            }

                                            return await getNpmGlobalInstalls(
                                                shell,
                                                info.containerName
                                            );
                                        },
                                        async () => {
                                            if (!info.isNode) {
                                                return [];
                                            }

                                            if (
                                                info.packageManager !==
                                                    'yarn' ||
                                                (info.packageManager ===
                                                    'yarn' &&
                                                    config.yarnVersion >= 2)
                                            ) {
                                                return [];
                                            }

                                            return await getYarnV1GlobalInstalls(
                                                shell,
                                                info.containerName
                                            );
                                        },
                                        async () => {
                                            if (
                                                (
                                                    info.image ||
                                                    composeNodeImage
                                                ).includes('alpine')
                                            ) {
                                                return await getAlpineInstallsAfterDate(
                                                    info.containerName,
                                                    info.created
                                                );
                                            } else {
                                                return await getAptInstallsAfterDate(
                                                    info.containerName,
                                                    info.created
                                                );
                                            }
                                        },
                                    ],
                                });
                            } else if (selected === 'recent') {
                                if (!panelActive) {
                                    return;
                                }

                                const recentItems =
                                    (config.get(`projectConfigs.${pathKey}`)
                                        .recentItems || {})[info.serviceName] ||
                                    [];

                                const recentOpts = new CmdList({
                                    label: 'Recent',
                                    positionParent: item,
                                    parent: screen,
                                    screen: screen,
                                    panel,
                                    subPanel: item,
                                    debug: panel.debug,
                                    fromCache: [...recentItems],
                                    itemOpts: [...recentItems],
                                    categories: false,
                                    action: (
                                        name,
                                        cmd,
                                        shell,
                                        category,
                                        hasArgs
                                    ) => {
                                        if (
                                            name === 'Nothing found' ||
                                            name === 'No apps found'
                                        ) {
                                            recentOpts.destroy();
                                            return;
                                        }

                                        cleanProcs = true;

                                        let command = `docker exec -it -e ${execEnvironment.join(
                                            ' -e '
                                        )} -u=root:dnv ${info.containerName}`;

                                        if (hasArgs || cmd.includes(' ')) {
                                            command += ` ${shell} -c ''${cmd}''`;
                                        } else {
                                            command += ` ${cmd}`;
                                        }

                                        panel.initItem(name, {
                                            key: info.serviceName,
                                            widget: ProgramTerminal,
                                            shellName: short,
                                            watchTerm: info.id,
                                            name,
                                            label: name,
                                            border: null,
                                            pty: true,
                                            hideCursor: false,
                                            cursorBlink:
                                                cmd === 'nano' ? true : false,
                                            command,
                                            commandHasArgs: hasArgs,
                                            termType: 'program',
                                            help: {
                                                keys: {
                                                    'C-a': helperText(
                                                        'Actions',
                                                        'A'
                                                    ),
                                                    'C-p': helperText(
                                                        'Copy',
                                                        'p'
                                                    ),
                                                },
                                            },
                                        });
                                    },
                                });
                            } else if (selected === 'scripts') {
                                if (!panelActive) {
                                    return;
                                }

                                containerOpts.switching = true;

                                const scriptOpts = new CmdList({
                                    label: 'Run Script',
                                    positionParent: item,
                                    parent: screen,
                                    screen: screen,
                                    panel,
                                    subPanel: item,
                                    key: 'script-opts',
                                    categories: true,
                                    categoryColors: {
                                        npm: 'red',
                                        yarn: 'blueBright',
                                        shell: 'green',
                                    },
                                    action: (
                                        name,
                                        cmd,
                                        shell,
                                        category,
                                        hasArgs
                                    ) => {
                                        if (
                                            name === 'Nothing found' ||
                                            name === 'No apps found'
                                        ) {
                                            scriptOpts.destroy();
                                            return;
                                        }

                                        cleanProcs = true;

                                        const command = `docker exec -it -e ${execEnvironment.join(
                                            ' -e '
                                        )} -u=root:dnv ${
                                            info.containerName
                                        } ${shell}`;

                                        panel.initItem(name, {
                                            key: info.serviceName,
                                            widget: ShellTerminal,
                                            shellName: short,
                                            watchTerm: info.id,
                                            label: name,
                                            border: null,
                                            pty: true,
                                            hideCursor: false,
                                            cwd: info.path,
                                            command,
                                            shellCommand: cmd,
                                            termType: 'shell',
                                            cursorBlink: true,
                                            shellType: 'script',
                                            help: {
                                                keys: {
                                                    'C-a': helperText(
                                                        'Actions',
                                                        'A'
                                                    ),
                                                    'C-s': helperText(
                                                        'Search',
                                                        'S'
                                                    ),
                                                    'C-p': helperText(
                                                        'Copy',
                                                        'p'
                                                    ),
                                                },
                                            },
                                        });
                                    },
                                    itemOpts: [
                                        async () => {
                                            return info.isNode
                                                ? getPackageScripts(
                                                      info.path,
                                                      info.shell,
                                                      info.packageManager
                                                  )
                                                : [];
                                        },

                                        async () => {
                                            return await getShellScripts(
                                                info.shell,
                                                info.containerName,
                                                info.workingDir
                                            );
                                        },
                                    ],
                                });
                            } else if (selected === 'metrics') {
                                panel.initItem('metrics', {
                                    clickable: true,
                                    mouseFocus: true,
                                    widget: Grid,
                                    nav: false,
                                    key: `${info.serviceName}Metrics`,
                                    border: null,
                                    label: 'Metrics',
                                    widthOffset: -2,
                                    heightOffset: 0,
                                    panelGrid: {
                                        heightOffset: -1,
                                        yOffset: [0, -1],
                                    },
                                    help: {
                                        showKeys: true,
                                        keys: {
                                            'w/s': 'Zoom',
                                            'a/d': 'Scroll',
                                            'z/x': 'Start/End',
                                        },
                                    },
                                    items: [
                                        {
                                            widget: Stats,
                                            port: info.env.STATS_PORT,
                                            metrics: ['CPU'],
                                            unit: '%',
                                            watchTerm: info.id,
                                            labels: {
                                                CPU: 'CPU Usage',
                                            },
                                            showXAxis: false,
                                        },
                                        {
                                            widget: Stats,
                                            port: info.env.STATS_PORT,

                                            metrics: [
                                                'heapUsed',
                                                'heapTotal',
                                                'rss',
                                            ],
                                            unit: 'mb',
                                            maxY: 45,
                                            watchTerm: info.id,
                                            labels: {
                                                heapUsed: 'Used',
                                                heapTotal: 'Total',
                                                rss: 'RSS',
                                            },
                                            showXAxis: false,
                                            labelOffset: -8,
                                            align: 'right',
                                            nonZero: [
                                                'heapUsed',
                                                'heapTotal',
                                                'rss',
                                            ],
                                        },
                                        {
                                            widget: Stats,
                                            port: info.env.STATS_PORT,

                                            metrics: ['High', 'Delay'],
                                            unit: 'ms',
                                            maxY: 5,
                                            watchTerm: info.id,
                                            labels: {
                                                Delay: 'Event Loop',
                                                High: 'High',
                                            },
                                            nonZero: ['Delay', 'High'],
                                        },
                                        {
                                            widget: Stats,
                                            port: info.env.STATS_PORT,

                                            metrics: ['handles'],
                                            unit: ' handles',
                                            maxY: 7,
                                            watchTerm: info.id,
                                            labels: {
                                                handles: 'Active Handles',
                                            },
                                            nonZero: ['handles'],
                                        },
                                    ],
                                });
                            }
                        },
                    });
                },
            },
        });
    }

    screen.on('focus', () => {
        const focused = screen.focused;

        focused.options.i;
    });

    screen.ignoreLocked = [
        'C-q',
        'f9',
        'C-left',
        'C-right',
        'M-left',
        'M-right',
        'M-up',
        'M-down',
        'up',
        'down',
        'pageup',
        'pagedown',
        'M-pageup',
        'M-pagedown',
        'S-pageup',
        'S-pagedown',
        'C-pageup',
        'C-pagedown',
        'S-up',
        'S-down',
        'home',
        'end',
        'M-x',
    ];

    screen.defIgnoreLocked = [...screen.ignoreLocked];

    const layout = new UI({
        key: 'layout',
        screen,
        parent: screen,
        items,
    });

    items = [];

    const eventStream = await containerEventStream(
        Object.keys(containerService),
        (data) => {
            const event = JSON.parse(data.toString());
            const container = event.Actor.Attributes.name;
            const action = event.Action;
            layout
                .getItem(containerService[container])
                .write(`${container} ${action}\n`);
        }
    );

    let preResizing = false;

    screen.program.on(
        'pre-resize',
        debounce(
            (cb) => {
                if (!preResizing) {
                    preResizing = true;

                    (function emit(el) {
                        if (el.preResize) {
                            el.preResize();
                        }
                        el.children.forEach(emit);
                    })(screen);

                    cb();

                    preResizing = false;
                }
            },
            100,
            { trailing: true }
        )
    );

    screen.unkey('C-c');

    screen.key('f9', () => {
        if (!screen.helpOpen) {
            screen.helpOpen = true;

            help(screen, layout, () => {
                screen.helpOpen = false;
            });
        }
    });

    const close = () => {
        screen.userClose = true;
        screen.program.closing = true;

        screen.program.disableMouse();
        mouseDisabled = true;

        blessed.box({
            parent: screen,
            focused: true,
            top: 1,
            left: 1,
            height: 3,
            width: '99%',
            valign: 'center',
            align: 'left',
            content: 'Shutting down...',
            border: {
                type: 'line',
                fg: 'brightblue',
            },
            style: {
                fg: 'brightcyan',
                shadow: true,
            },
        });

        screen.render();

        setTimeout(() => {
            screen.render();

            if (eventStream) {
                eventStream.destroy();
            }

            /*
                There's probably a more elegant way to clean up the processes than this aggressive pkill x2 business.
                But, this reliably kills processes started from shells (i.e. opening bash/sh then running 'top').
                Just doing one pass would sometimes fail to kill the starting bash/sh process, especially with
                multiple shell + program process pairs to clean up
            */

            if (cleanProcs) {
                Promise.all(
                    Object.values(services).map((info) =>
                        killDnvProcesses(info.shell, info.containerName)
                    )
                );

                // Once more, with feeling
                Promise.all(
                    Object.values(services).map((info) =>
                        killDnvProcesses(info.shell, info.containerName)
                    )
                );
            }

            // If DNV started every service specified in docker-compose-etc.yml, then we stop them on exit
            // otherwise, leave them running
            if (stop) {
                stop = false;

                if (externalVolume) {
                    execa.commandSync(
                        `docker-compose -p ${projectName} -f ${dnvComposeFile} kill`
                    );
                } else {
                    execa.commandSync(`docker-compose kill`);
                }
            }

            setTimeout(() => {
                screen.destroy();
                process.stdout.write('\x1b[?25h');
                process.stdout.write(ansiEscapes.clearTerminal);
                process.exit(0);
            }, 1000);
        }, 250);
    };

    screen.key('C-q', () => {
        closePrompt(screen, layout, close);
    });

    screen.on('close prompt', () => {
        closePrompt(screen, layout, close);
    });

    layout.focus();

    setTimeout(() => {
        screen.emit('resize');

        UI.hideCursor(screen);

        screen.render();
    });

    if (os.platform() === 'win32') {
        const reHideCursor = debounce(
            () => {
                if (!layout.promptOpen && !screen.promptOpen) {
                    UI.hideCursor(screen, true);
                }
            },
            250,
            { trailing: true }
        );

        screen.on('resize', reHideCursor);
    }
};

module.exports = multiplex;
