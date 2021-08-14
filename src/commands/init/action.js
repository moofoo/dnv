const pWaterfall = require('p-waterfall');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const execa = require('execa');
const YAMLJS = require('yamljs');
const { DockerFile, ComposeFile } = require('../../lib/file-gen');
const { success, title2, error, info } = require('../../lib/text');
const { config } = require('../../lib/config');
const { files } = require('../../lib/files');

const cleanProject = require('../clear/all');

const getPackageManagerPrompt = require('../config/prompts/packageManager');
const getDockerImagePrompt = require('../config/prompts/dockerfileNodeImage');
const getComposeImagePrompt = require('../config/prompts/composeNodeImage');
const getWorkingDirPrompt = require('../config/prompts/workingDir');
const getUiStatsPrompt = require('../config/prompts/uiStats');
const getWatchFilesPrompt = require('../config/prompts/watchFiles');

let prompts;
let createdDockerFile = false;
let createdComposeFile = false;
let repoPaths = [];
let done = false;

const getShortPath = p => {
    if (typeof p !== 'string') {
        files.getFullFile(p = p.path);
    }

    let base = path.basename(p);
    if (/\w+\.\w+/.test(base)) {
        p = p.replace('/' + base, '');
        base = path.basename(p);
    }

    const base2 = path.basename(p.replace('/' + base, ''));

    return base2 + '/' + base;
};

const getValue = (key, val) => {
    if (val !== undefined && val !== 'default') {
        return val;
    }

    const def = config.get('defaultConfig');

    return def[key];
};

const getPrompt = async (key, opts, services) => {
    const { defaults, useDefaults } = opts;

    let prompt = prompts[key];

    if (typeof prompt === 'function') {
        prompt = prompt(services);
    }

    const answers = !useDefaults
        ? await inquirer.prompt([prompt])
        : {
            [key]: defaults[key],
        };

    let { [key]: answerValue } = answers;

    answerValue =
        answerValue === 'default'
            ? defaults[key]
            : answerValue === defaults[key]
                ? 'default'
                : answerValue;

    return answerValue;
};

const resetPrompt = async (opts = {}) => {
    title2('Initialize Project');

    const isSet = config.isProjectConfigSet();

    if (isSet) {
        const { reset } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'reset',
                message:
                    'Project already initialized. Reset config and continue? (choosing "No" will quit init)',
                default: false,
            },
        ]);

        if (!reset) {
            process.exit(0);
        }

        console.log('Clearing existing config...');

        const { pathKey } = config.getProjectConfig();

        await cleanProject(true, pathKey, false);

        files.deleteFile('docker-compose-dnv-gen.yml');
    }

    return opts;
};

const checkForExisting = async opts => {
    opts.existingCompose = false;
    opts.composeFile = `${files.cwd}/docker-compose.yml`;

    const composeFile = ComposeFile.exists();

    opts.existingDockerfile = DockerFile.exists();

    if (opts.existingDockerfile) {
        opts.createdDockerFile = false;
    }

    if (composeFile) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                message:
                    'docker-compose.yml already exists. Use existing file? (Yes or quit init)',
                default: true,
                name: 'existingCompose',
            },
        ]);

        if (!answers.existingCompose) {
            process.exit(0);
        }

        opts.composeFile = composeFile;
        opts.existingCompose = answers.existingCompose;

        const cf = ComposeFile.getInstance(composeFile, files.cwd, false);
        const output = cf.checkDockerFiles();

        if (!output.valid) {
            if (output.invalidServices.length) {
                error(
                    `docker-compose.yml references non-existent Dockerfile in service(s): ${output.invalidServices.join(
                        ', '
                    )}`
                );
            } else {
                error(
                    'docker-compose.yml does not reference any Dockerfiles that DNV could find'
                );
            }
            process.exit(0);
        }
    } else {
        if (DockerFile.exists()) {
            error(
                'Dockerfile found but no related docker-compose.yml found. exiting'
            );
            process.exit(0);
        }
    }

    return opts;
};

const externalVolumePrompt = async (opts = {}) => {
    const { eVolume } = await inquirer.prompt({
        type: 'confirm',
        message:
            'Do you want DNV to manage project dependencies in an external volume?',
        name: 'eVolume',
        default: true,
    });

    opts.externalVolume = eVolume || false;

    return opts;
};

let displayed = false;

const dependencyMessage = () => {
    if (!displayed) {
        displayed = true;
        console.log('\n');
        info(
            'For DNV to work correctly, dependency-related files must be present before continuing\n'
        );
    }
};

const dependencyPrompts = async opts => {
    const { repoPaths, multiRepo, workingDir } = opts;

    let packageManager = await getPrompt('packageManager', opts);

    packageManager = getValue('packageManager', packageManager);

    let yarnVersion;

    if (packageManager === 'yarn 2') {
        packageManager = 'yarn';
        yarnVersion = 2;
    } else if (packageManager === 'yarn') {
        yarnVersion = 1;
    }

    opts.packageManager = packageManager;
    opts.yarnVersion = yarnVersion;

    let paths;

    if (!multiRepo) {
        paths = [files.cwd];
    } else {
        paths = repoPaths;
    }

    for (const np of paths) {
        let nodePath;
        let shortPath;


        if (typeof np === 'object') {
            nodePath = files.getFullFile(np.path);
            shortPath = getShortPath(nodePath);

        } else {
            shortPath = getShortPath(np);
            nodePath = np;
        }

        if (packageManager === 'yarn') {
            let yarnLock = 'yarn.lock';
            if (yarnVersion === 2) {
                if (!fs.existsSync(nodePath + '/.yarnrc.yml')) {
                    dependencyMessage();

                    const { setBerry } = await inquirer.prompt({
                        type: 'confirm',
                        name: 'setBerry',
                        message: `Yarn v2 set for package manager, but .yarnrc.yml not found in ${shortPath}. Run "yarn set version berry"? (Yes or quit init)`,
                        default: true,
                    });

                    if (!setBerry) {
                        process.exit(0);
                    }

                    execa.commandSync('yarn set version berry', {
                        cwd: nodePath,
                        stdio: 'inherit',
                    });
                } else {
                    const yml = YAMLJS.parse(
                        fs.readFileSync(nodePath + '/.yarnrc.yml', 'utf-8')
                    );

                    yarnLock = yml.lockfileFilename || 'yarn.lock';
                }
            }

            if (!fs.existsSync(nodePath + '/' + yarnLock)) {
                dependencyMessage();

                const { yarn1Install } = await inquirer.prompt({
                    type: 'confirm',
                    name: 'yarn1Install',
                    message: `Yarn set for package manager, but yarn.lock not found in ${shortPath}. Run 'yarn install'? (Yes or quit init)`,
                    default: true,
                });

                if (!yarn1Install) {
                    process.exit(0);
                }

                if (yarnVersion >= 2) {
                    const packageJson = files.getPackageJson(nodePath);

                    const deps = Object.keys(packageJson.dependencies || {});

                    if (!deps.includes('node-gyp')) {
                        let addGyp = false;

                        for (const dep of deps) {
                            if (
                                [
                                    'node-sass',
                                    'node-libcurl',
                                    're2',
                                    'yoga-layout',
                                    'node-gd',
                                    'sqlite3',
                                    'nodegit',
                                    'ttf2woff2',
                                    'gl',
                                    'metrohash',
                                    'node-gtk',
                                    'pg-query-native',
                                    'node-pty',
                                ].includes(dep)
                            ) {
                                addGyp = true;
                            }
                        }

                        if (addGyp) {
                            const { addNodeGyp } = await inquirer.prompt({
                                type: 'confirm',
                                name: 'addNodeGyp',
                                message: `It looks like you have a dependency that depends on node-gyp.\nIt is strongly recommended that you add node-gyp to your dependencies now. Run 'yarn add node-gyp'?`,
                                default: true,
                            });

                            if (addNodeGyp) {
                                execa.commandSync('yarn add node-gyp', {
                                    cwd: nodePath,
                                    stdio: 'inherit',
                                });
                            }
                        }
                    }
                }

                execa.commandSync('yarn install', {
                    cwd: nodePath,
                    stdio: 'inherit',
                });
            }
        } else {
            if (!fs.existsSync(nodePath + '/package-lock.json')) {
                dependencyMessage();



                const { npmInstall } = await inquirer.prompt({
                    type: 'confirm',
                    name: 'npmInstall',
                    message: `NPM set for package manager, but package-lock.json not found in ${shortPath}. Run 'npm install'? (Yes or quit init)`,
                    default: true,
                });

                if (!npmInstall) {
                    process.exit(0);
                }

                const { stdout } = await execa(
                    'npm',
                    [
                        'install',
                        '--update-notifier=false',
                        '--progress=false',
                        '--fund=false',
                        '--audit=false',
                        '--color=false',
                        '--strict-ssl=false',
                        '--prefer-offline=true',
                    ],
                    { cwd: nodePath }
                );

                stdout.split('\n').forEach(line => {
                    if (line.includes(' packages in ')) {
                        console.log(line + '\n');
                    }
                });
            }
        }
    }

    return opts;
};

const startupSetOpts = async (opts = {}) => {
    const { externalVolume } = opts;

    opts.useDefaults = false;

    prompts = {
        composeNodeImage: await getComposeImagePrompt(true, true),
        dockerfileNodeImage: await getDockerImagePrompt(true, true),
        packageManager: getPackageManagerPrompt(true, true),
        workingDir: getWorkingDirPrompt(true, true),
        watchFiles: services => getWatchFilesPrompt(true, true, services),
        uiStats: services => getUiStatsPrompt(true, true, services),
    };

    const defaults = config.get('defaultConfig');

    const projectName = files.getUniqueName(
        null,
        externalVolume ? null : files.getFormattedDir(files.cwd),
        files.cwd
    );

    opts = {
        ...opts,
        defaults,
        projectName,
    };

    return opts;
};

const repoPathPrompts = async opts => {
    const hasPkgJson = files.hasPackageJson();

    let repoPaths = (await files.getMultiRepoPaths()) || [];
    let multiRepo = false;

    if (hasPkgJson) {
        repoPaths.push({
            path: files.cwd,
            shortPath: files.getShortPath(files.cwd),
            pkgJson: `${files.cwd}/package.json`,
            dir: files.getDir(files.cwd),
            formatted: files.getFormattedDir(files.cwd),
        });
    } else if (!hasPkgJson && repoPaths.length > 0) {
        const { isMultiRepo } = await inquirer.prompt({
            type: 'confirm',
            name: 'isMultiRepo',
            message:
                'Multiple package.json files found in sub-directories. Does this project run more than one Node service?',
        });

        multiRepo = isMultiRepo;

        if (multiRepo) {
            const choices = repoPaths.map(mr => mr.dir);

            const { dirs } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'dirs',
                    choices,
                    message:
                        'Select the directories with Node applications. Each will become a service in the compose file',
                },
            ]);

            repoPaths = repoPaths.filter(data => {
                if (dirs.includes(data.dir)) {
                    return true;
                }
            });
        } else if (!hasPkgJson) {
            error('package.json not found');
            process.exit(0);
        }
    } else if (!hasPkgJson && (!repoPaths || repoPaths.length === 0)) {
        error('package.json not found');
        process.exit(0);
    }

    if (multiRepo) {
        repoPaths = repoPaths.filter(rp => {
            return rp.path !== process.cwd()
        })
    }

    opts.multiRepo = multiRepo;
    opts.repoPaths = repoPaths;
    return opts;

    /*

    let multiRepo = false;

    if (repoPaths.length > 0) {
        const { isMultiRepo } = await inquirer.prompt({
            type: 'confirm',
            name: 'isMultiRepo',
            message:
                'Multiple package.json files found in sub-directories. Does this project run more than one Node service?',
        });

        multiRepo = isMultiRepo;
    }

    if (multiRepo) {
        const choices = repoPaths.map((mr) => mr.dir);

        const { dirs } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'dirs',
                choices,
                message:
                    'Select the directories with Node applications. Each will become a service in the compose file',
            },
        ]);

        repoPaths = repoPaths.filter((data) => {
            if (dirs.includes(data.dir)) {
                return true;
            }
        });
    }

    if (!files.hasPackageJson() && !multiRepo) {
        error('No suitable package.json file(s) found');
        process.exit(0);
    } else if (repoPaths.length === 0) {
        repoPaths.push({
            path: files.cwd,
            shortPath: files.getShortPath(files.cwd),
            pkgJson: `${files.cwd}/package.json`,
            dir: files.getDir(files.cwd),
            formatted: files.getFormattedDir(files.cwd),
        });
    }

    opts.multiRepo = multiRepo;
    opts.repoPaths = repoPaths;

    return opts;
    */
};

const newDockerfilePrompts = async opts => {
    const workingDir = await getPrompt('workingDir', opts);
    const dockerfileNodeImage = await getPrompt('dockerfileNodeImage', opts);

    const { nodeUser } = await inquirer.prompt({
        type: 'confirm',
        name: 'nodeUser',
        message: `Use Node User (instead of root)?`,
        default: false,
    });

    opts.nodeUser = nodeUser;
    opts.dockerfileNodeImage = dockerfileNodeImage;
    opts.workingDir = workingDir;
    opts.dockerfileName = 'Dockerfile';

    return opts;
};

const createDockerfilePrompts = async opts => {
    const { repoPaths, existingCompose, multiRepo } = opts;

    if (existingCompose) {
        opts.createdDockerFile = false;
        return opts;
    }

    createdDockerFile = true;

    opts.createdDockerFile = true;

    opts = await newDockerfilePrompts(opts);

    const { dockerfileNodeImage, workingDir, dockerfileName, packageManager } =
        opts;

    let index = 0;

    for (const data of repoPaths) {
        const dPath = data.path;

        DockerFile.createGenericDockerfile({
            filename: dPath + '/' + dockerfileName,
            packageManager: getValue('packageManager', packageManager),
            yarnVersion: opts.yarnVersion,
            nodeImage: getValue('dockerfileNodeImage', dockerfileNodeImage),
            workingDir: getValue('workingDir', workingDir),
            nodeUser: opts.nodeUser,
            multiRepo,
            dir: data.formatted,
        });

        repoPaths[index].dockerfile = dPath + '/' + dockerfileName;

        index++;
    }

    opts.repoPaths = repoPaths;

    return opts;
};

const composeFilePrompts = async opts => {
    let {
        composeFile,
        existingCompose,
        workingDir,
        repoPaths,
        projectName,
        useDefaults,
        multiRepo,
        packageManager,
        externalVolume,
        yarnVersion,
    } = opts;

    opts.createdComposeFile = false;

    repoPaths = repoPaths || [];
    composeFile = composeFile || `${files.cwd}/docker-compose.yml`;

    if (!existingCompose) {
        opts.createdComposeFile = true;

        await ComposeFile.createGenericCompose({
            workingDir: getValue('workingDir', workingDir),
            packageManager,
            multiRepo,
            dockerfiles: repoPaths,
            composeFile,
            yarnVersion,
        });

        createdComposeFile = true;
    }

    createdDockerFile = opts.createdDockerFile;

    let cf = ComposeFile.getInstance(
        composeFile,
        files.cwd,
        true,
        projectName,
        externalVolume,
        packageManager,
        yarnVersion
    );

    let remakeCF = !cf.hasInitTTY;

    if (!cf.hasInitTTY) {
        const { addInitTTY } = await inquirer.prompt({
            type: 'confirm',
            name: 'addInitTTY',
            message: `For DNV up/ui to work correctly, services in docker-compose.yml should have 'init' and 'tty' set to 'true'. \nCan DNV set these options for services defined in docker-compose.yml?`,
            default: true,
        });

        if (addInitTTY) {
            ComposeFile.addInitTTY(composeFile, files.cwd);
            console.log('Done');
        }
    }

    if (remakeCF) {
        cf = ComposeFile.getInstance(
            composeFile,
            files.cwd,
            true,
            projectName,
            externalVolume,
            packageManager,
            yarnVersion
        );
    }

    opts.name = opts.projectName = cf.projectName;
    opts.composeFile = cf.path;

    opts.watchFiles = useDefaults
        ? []
        : await getPrompt('watchFiles', opts, cf.services);

    opts.uiStats = [];

    let nodeImage = opts.defaults.composeNodeImage;
    opts.composeNodeImage = nodeImage;

    if (externalVolume) {
        const { uiStats } = await inquirer.prompt({
            type: 'checkbox',
            message: 'Enable metrics display for Node services in DNV UI?',
            name: 'uiStats',
            choices: cf.nodeServiceNames || [],
        });

        opts.uiStats = uiStats;

        let compNodeImage;

        const { useAlt } = await inquirer.prompt({
            type: 'confirm',
            message: 'Use alternate image for DNV-started Node Services?',
            name: 'useAlt',
            default: false,
        });

        if (useAlt) {
            const prompt = await getComposeImagePrompt(true, true, nodeImage);

            prompt.default = nodeImage;

            prompt.message = 'Select node image';

            let { composeNodeImage } = await inquirer.prompt(prompt);

            if (composeNodeImage === 'default') {
                composeNodeImage = opts.defaults.composeNodeImage;
            }

            compNodeImage = composeNodeImage;
        } else {
            compNodeImage = 'dockerfile';
        }

        opts.composeNodeImage = compNodeImage;

        if (compNodeImage !== 'dockerfile') {
            for (const [name, service] of Object.entries(cf.services)) {
                if (service.isNode) {
                    cf.services[name].image = compNodeImage;
                }
            }
        }

        opts.dnvComposeFile = `${files.cwd}/docker-compose-dnv-gen.yml`;
    } else {
        opts.dnvComposeFile = null;
    }

    cf.updateConfig(opts);

    if (opts.createdDockerFile) {
        console.log('Creating Dockerfile...');
    }

    if (opts.createdComposeFile) {
        console.log('Creating docker-compose.yml...');
    }

    return opts;
};

const initProjectConfig = async opts => {
    const {
        composeNodeImage,
        composeFile,
        dnvComposeFile,
        name,
        serviceNames,
        composeFileTime,
        services,
        uiStats,
        watchFiles,
        externalVolume,
    } = opts;

    config.mergeProjectConfig(
        files.initProjectData({
            externalVolume,
            name,
            composeFile,
            composeFileTime,
            composeNodeImage,
            dnvComposeFile,
            removeOrphans: 'default',
            watchFiles,
            watchIgnore: 'default',
            forceInstall: 'default',
            installGlobals: {},
            execItems: {},
            recentItems: {},
            execEnvironment: 'default',
            uiReplDeps: {},
            uiReplDevDeps: {},
            allUiServices: serviceNames,
            uiServices: serviceNames,
            uiStats,
            uiSince: 'default',
            uiScrollback: 'default',
            populateFailed: externalVolume ? null : false,
            services,
        })
    );

    success('DNV Project Initialized!');

    done = true;
};

const onQuit = () => {
    if (!done) {
        for (const repo of Object.values(repoPaths)) {
            const { path: repoPath } = repo;

            if (createdDockerFile && fs.existsSync(repoPath + '/Dockerfile')) {
                fs.unlinkSync(repoPath + '/Dockerfile');
            }

            if (
                createdComposeFile &&
                fs.existsSync(repoPath + '/docker-compose.yml')
            ) {
                fs.unlinkSync(repoPath + '/docker-compose.yml');
            }
        }
    }
};

const init = async (opts = {}) => {
    opts.done = false;

    process.on('exit', () => {
        onQuit();
    });

    // Terminate process on SIGINT (which will call process.on('exit') in return)
    process.stdin.on('SIGINT', () => {
        onQuit();
    });

    const tasks = [
        resetPrompt,
        checkForExisting,
        startupSetOpts,
        repoPathPrompts,
        dependencyPrompts,
        externalVolumePrompt,
        createDockerfilePrompts,
        composeFilePrompts,
        initProjectConfig,
    ];

    await pWaterfall(tasks, opts);
};

module.exports = init;
