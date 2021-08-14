const CFonts = require('cfonts');
const pWaterfall = require('p-waterfall');
const chalk = require('chalk');
const os = require('os');
const debounce = require('lodash.debounce');

const { error } = require('../../lib/text');
const { config } = require('../../lib/config');
const blessed = require('../../lib/ui/blessed');
const multiplex = require('../../lib/ui/multiplex');

const {
    checkAndValidateFiles,
    optionProcessing,
    setupServiceSince,
    checkBuild,
    populateVolumeAndInstallDependences,
    setupNodeUser,
    initWatchFiles,
    runBuild,
    installGlobals,
    recordUpdate,
} = require('../up/action');

let container;
let box;
let progress;
let screen;
let updateBoxContent;

const delay = (time, cb) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            if (cb) {
                cb();
            }
            resolve();
        }, time);
    });
};

const initBlessed = (opts = {}) => {
    screen = blessed.screen({
        useBCE: false,
        smartCSR: true,
        fastCSR: false,
        extended: true,
        debug: false,
        forceUnicode: true,
        fullUnicode: true,
        terminal: 'xterm-256color',
        dockBorders: false,
        ignoreDockContrast: true,
        checkScrollable: false,
        resizeTimeout: 75,
        cursor: {
            shape: 'block',
        },
        mouseSupport: os.platform() === 'linux',
        mouseOpts: {
            vt200Mouse: true,
            utfMouse: true,
            cellMotion: true,
            allMotion: true,
            sendFocus: true,
        },
        sendFocus: true,
        style: {
            bg: 0,
        },
    });

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

    screen.ignoreLocked = ['C-c'];

    screen.key('C-c', () => {
        screen.destroy();
        process.exit(0);
    });

    const prettyFont = CFonts.render('D N V', {
        font: '3d',
        colors: ['black', 'blue'],
    });

    container = blessed.box({
        parent: screen,
        screen,
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        style: {
            bg: 0,
        },
    });

    box = blessed.box({
        parent: container,
        screen,
        content: prettyFont.string,
        width: 72,
        height: 12,
        top: 0,
        left: 'center',
        style: {
            bg: 0,
        },
    });

    screen.append(box);

    progress = blessed.log({
        screen,
        parent: screen,
        valign: 'center',
        align: 'left',
        width: '55%',
        height: screen.rows - 18,
        top: 16,
        left: '50%-25',
        style: {
            bg: 0,
        },
    });

    progress.add('Validating Dockerfiles');

    screen.append(progress);

    screen.render();

    opts.progressMsg = (msg) => {
        progress.add(msg);
        screen.render();
    };

    let progression = [
        ['black', 'blue'],
        ['black', 'blue'],
        ['black', '#2A008F'],
        ['black', '#67179B'],
        ['black', '#9819AA'],
        ['black', '#AA1994'],
        ['black', '#C31D62'],
        ['black', '#AA1994'],
        ['black', '#67179B'],
        ['black', '#67179B'],
        ['blue', '#C31D62'],
        ['blue', '#AA1994'],
        ['blueBright', 'redBright'],
        ['cyanBright', 'red'],
        ['cyan', 'red'],
        ['cyan', 'red'],
        ['cyan', 'red'],
    ].map((colors) => {
        return CFonts.render('D N V', {
            font: '3d',
            colors,
        }).string;
    });

    let prog;

    updateBoxContent = () => {
        if (progression.length) {
            prog = progression.shift();

            box.setContent(prog);

            screen.render();

            return false;
        } else {
            progression = null;
            return true;
        }
    };

    return opts;
};

const runUpDetached = (opts) => {
    return new Promise((resolve, reject) => {
        let {
            allUp,
            name: projectName,
            nodeContainers,
            removeOrphans,
            services,
            progressMsg,
            externalVolume,
            buildCmd,
            newBuild,
            quit,
            noRecreate,
        } = opts;
        if (quit) {
            return opts;
        }

        setTimeout(async () => {
            screen.render();

            buildCmd = buildCmd || null;

            const start = Math.floor(Date.now() / 1000);
            opts.success = true;

            if (!allUp) {
                const { dnvUpDetached } = require('../../lib/docker/cli');

                try {
                    await dnvUpDetached({
                        progress: progressMsg,
                        projectName,
                        removeOrphans,
                        nodeContainers,
                        services,
                        externalVolume,
                        buildCmd,
                        newBuild,
                        noRecreate,
                    });
                } catch (err) {
                    reject(err);
                }
            }

            if (!opts.success) {
                progressMsg('Press any key to return to command line');

                if (screen) {
                    screen.once('keypress', (ch, key) => {
                        screen.destroy();
                        process.exit(0);
                    });
                }
            } else {
                const since = Math.floor(Date.now() / 1000) - start + 10;

                for (const [name] of Object.entries(services)) {
                    services[name].since = `${since}s`;
                }

                opts.services = services;
            }
            resolve(opts);
        });
    });
};

const startDnvUI = async (opts) => {
    const { services, allUp, uiScrollback, progressMsg } = opts;

    recordUpdate();

    if (!allUp) {
        progressMsg('Starting Containers');
    } else {
        progressMsg('Attaching to Containers');
    }

    const splashInterval = setInterval(() => {
        if (updateBoxContent()) {
            clearInterval(splashInterval);

            setTimeout(async () => {
                box.free();
                box.detach();
                box.destroy();
                box = null;

                progress.free();
                progress.destroy();
                progress = null;

                screen.render();

                await multiplex(opts, services, !allUp, screen, uiScrollback);
            }, 500);
        }
    }, 70);
};

const wrapTasks = (tasks) => {
    return tasks.map((task) => {
        return (inOpts = {}) => {
            return new Promise((resolve) => {
                if (screen) {
                    screen.render();
                }

                setTimeout(async () => {
                    let outOpts;
                    try {
                        outOpts = await task(inOpts);
                    } catch (err) {
                        config.setProjectConfigProp(
                            inOpts.pathKey,
                            'populateFailed',
                            null
                        );

                        if (typeof err === 'object') {
                            if (err.message) {
                                inOpts.progressMsg(error(err.message, false));
                            } else {
                                inOpts.progressMsg(error(err.stderr, false));
                            }
                        } else {
                            inOpts.progressMsg(error(err, false));
                        }

                        if (screen) {
                            inOpts.progressMsg(
                                chalk.yellowBright('Press any key to exit')
                            );
                            await new Promise(() => {
                                if (screen) {
                                    screen.once('keypress', (ch, key) => {
                                        if (
                                            !['up', 'down'].includes(key.name)
                                        ) {
                                            screen.destroy();
                                            process.exit(0);
                                        }
                                    });
                                }
                            });
                        } else {
                            await delay(3000);
                            process.exit(0);
                        }
                    }
                    resolve(outOpts);
                });
            });
        };
    });
};

const upAction = async (opts = {}) => {
    const { quit } = opts;

    if (quit) {
        opts.progressMsg = console.log;
    }

    opts.dnvui = true;

    if (!config.isProjectConfigSet()) {
        error('Project not initialized');
        process.exit(0);
    }

    opts = { ...config.getProjectConfig(true), ...opts };

    if (!quit) {
        opts = initBlessed(opts);
    }

    const tasks = wrapTasks([
        checkAndValidateFiles,
        optionProcessing,
        setupServiceSince,
        checkBuild,
        populateVolumeAndInstallDependences,
        setupNodeUser,
        runBuild,
        installGlobals,
        initWatchFiles,
        runUpDetached,
    ]);

    opts = await pWaterfall(tasks, opts);

    if (opts.quit) {
        return;
    }

    if (opts.success) {
        await startDnvUI(opts);
    } else {
        console.log('Something went wrong');
    }
};

module.exports = upAction;
