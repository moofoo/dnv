const fs = require('fs');
const execa = require('execa');
const StreamZip = require('node-stream-zip');
const { getDocker } = require('../../../docker/util');
const { getContainerStateSync } = require('../../../docker/containers');
const { files } = require('../../../files');
const path = require('path');

const getAlpineInstallsAfterDate = async (containerName, createdTime) => {
    const state = getContainerStateSync(containerName);

    if (!state.exists) {
        return [
            {
                category: 'apk',
                cmd: '',
                name: 'CONTAINER NOT FOUND',
                shell: '/bin/sh',
            },
        ];
    }

    createdTime =
        String(createdTime).length > 10 ? createdTime / 1000 : createdTime;

    let output;

    try {
        output = execa.sync(
            'docker',
            [
                'exec',
                containerName,
                '/bin/sh',
                '-c',
                `"apk list --installed | awk '{print $3}'"`,
            ],
            { shell: true, stdio: 'pipe' }
        );
    } catch (err) {}

    if (!output.stdout) {
        return [];
    }

    const modules = output.stdout
        .split('\n')
        .map((module) => module.replace('{', '').replace('}', ''))
        .filter(
            (mod) =>
                ![
                    'su-exec',
                    'tzdata',
                    'zlib',
                    'apk-tools',
                    'musl',
                    'openssl',
                    'ncurses',
                    'alpine-baselayout',
                    'alpine-keys',
                    'busybox',
                    'pax-utils',
                    'file',
                    'ca-certificates',
                    'libc-dev',
                    'libtls-standalone',
                    '.redis-rundeps',
                    'openssl',
                    'python3',
                    'python2',
                ].includes(mod)
        );

    if (modules.length === 0) {
        return [];
    }

    const command = `cd /usr/bin && stat -c '%n %Z' ` + modules.join(' ');

    let output2;

    try {
        output2 = execa.sync(
            'docker',
            ['exec', containerName, '/bin/sh', '-c', `"${command}"`],
            {
                shell: true,
                stdio: 'pipe',
            }
        );
    } catch (err) {
        output2 = err;
    }

    if (!output2.stdout) {
        return [];
    }
    const moduleTimes = output2.stdout.split('\n');

    if (moduleTimes.length === 0) {
        return [];
    }

    const packages = [];

    for (const mt of moduleTimes) {
        const module = mt.split(' ')[0];
        const time = mt.split(' ')[1];

        if (Number(time) >= createdTime) {
            packages.push({
                category: ['bash', 'zsh'].includes(module) ? 'shell' : 'apk',
                cmd: module,
                name: module,
                prog: module,
                shell: '/bin/sh',
            });
        }
    }

    return packages;
};

const getAptInstallsAfterDate = async (containerName, createdTime) => {
    const state = getContainerStateSync(containerName);

    if (!state.exists) {
        return [
            {
                category: 'apt',
                cmd: '',
                name: 'CONTAINER NOT FOUND',
                shell: '/bin/bash',
            },
        ];
    }

    createdTime =
        String(createdTime).length > 10 ? createdTime / 1000 : createdTime;

    let createdMonth =
        new Date(
            String(createdTime).length > 10 ? createdTime : createdTime * 1000
        ).getMonth() + 1;

    if (createdMonth <= 9) {
        createdMonth = [0, createdMonth];
    } else if (createdMonth === 10) {
        createdMonth = [1, 0];
    } else if (createdMonth === 11) {
        createdMonth = [1, 1];
    } else if (createdMonth === 12) {
        createdMonth = [1, 2];
    }

    let output;

    try {
        output = await execa(
            'docker',
            ['exec', containerName, '/bin/bash', '-c', `"apt-mark showmanual"`],
            { shell: true, stdio: 'pipe' }
        );
    } catch (err) {
        return [];
    }

    const nonAuto = output.stdout
        .split('\n')
        .filter((val) => val.trim() !== '');

    if (nonAuto.length === 0) {
        return [];
    }

    output = null;

    try {
        output = await execa(
            'docker',
            [
                'exec',
                containerName,
                '/bin/bash',
                '-c',
                `"grep -e '2[0-9][2-9][1-9]-[${createdMonth[0]}-9][${createdMonth[1]}-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9] install' /var/log/dpkg.log"`,
            ],
            { shell: true, stdio: 'pipe' }
        );
    } catch (err) {
        return [];
    }

    const latestPackages = [];

    const packages = output.stdout
        .split('\n')
        .reverse()
        .filter((val) => val.trim() !== '');

    if (packages.length === 0) {
        return [];
    }

    packages.forEach((line) => {
        const split = line.split(' ');
        const installDate = split[0];
        const installTime = split[1];
        let packageName = split[3];

        const time = new Date(installDate + ' ' + installTime).getTime() / 1000;

        if (
            time >= createdTime &&
            nonAuto.includes(packageName.split(':')[0])
        ) {
            packageName = packageName.split(':')[0];
            latestPackages.push({
                category: ['zsh'].includes(module) ? 'shell' : 'apt',
                cmd: packageName,
                name: packageName,
                prog: packageName,
                shell: '/bin/bash',
            });
        }
    });

    return latestPackages;
};

const getYarnV1GlobalInstalls = async (shell, containerName) => {
    const container = await getDocker().getContainer(containerName);

    if (!container) {
        return [];
    }

    let output;

    try {
        output = await execa.command(
            `docker exec ${containerName} /bin/sh -c "yarn global list --depth=0"`,
            {
                shell: true,
                stdio: 'pipe',
            }
        );
    } catch (err) {
        return [];
    }

    if (!output.stdout) {
        return [];
    }

    const items = output.stdout
        .split('\n')
        .filter((val) => val.trim() !== '' && val.includes('-'));

    if (items.length === 0) {
        return [];
    }

    const ret = items.map((item) => {
        const cmd = item.replace('-', '').trim();

        return {
            category: 'yarn',
            prog: 'yarn',
            cmd,
            name: cmd,
            shell,
        };
    });

    return ret;
};

const getNpmGlobalInstalls = async (shell, containerName) => {
    const container = await getDocker().getContainer(containerName);

    if (!container) {
        return [];
    }

    let output;

    try {
        output = await execa.command(
            `docker exec ${containerName} /bin/sh -c "npm ll -g --depth 0"`,
            {
                shell: true,
                stdio: 'pipe',
            }
        );
    } catch (err) {
        return [];
    }

    if (!output.stdout) {
        return [];
    }

    const items = output.stdout.split('\n').filter((val) => val.trim() !== '');

    if (items.length === 0) {
        return [];
    }

    const ret = items
        .filter((item) => {
            return item.includes('@') && !item.includes('npm@') && item !== '';
        })
        .map((item) => {
            const cmd = item.split('@')[0].split(' ')[1];

            return {
                category: 'npm',
                cmd,
                name: cmd,
                shell,
            };
        });

    return ret;
};

const getPackageScripts = (
    cwd,
    shell = '/bin/bash',
    manager = 'npm',
    scripts
) => {
    cwd = cwd || files.cwd;
    const pkg = files.getPackageJson(cwd);

    if (!pkg || (pkg && !pkg.scripts)) {
        return [];
    }

    scripts = scripts || Object.keys(pkg.scripts);

    return scripts.map((script) => {
        return {
            category: manager,
            name: script,
            prog: manager === 'npm' ? manager + ' run ' : manager,
            cmd: script,
            shell,
            detail: pkg.scripts[script],
        };
    });
};

const getShellScripts = async (shell, containerName, workingDir) => {
    const command = `find ./ -path ./node_modules -prune -false -o -maxdepth 3 -name  '*.sh'`;

    let output;

    try {
        output = await execa(
            'docker',
            ['exec', containerName, shell, '-c', `"${command}"`],
            {
                shell: true,
                stdio: 'pipe',
            }
        );
    } catch (err) {
        output = err;
    }

    if (!output.stdout) {
        return [];
    }

    const scripts = output.stdout
        .split('\n')
        .filter((val) => val.trim() !== '');

    if (scripts.length === 0) {
        return [];
    }

    return scripts.map((script) => {
        const split = script.split('/');
        return {
            category: 'shell',
            name: script.replace('./', ''),
            cmd: `${workingDir}/${script.replace('./', '')}`,
            shell,
        };
    });
};

const createDnvGroup = async (shell, containerName, user = 'root') => {
    try {
        if (!shell.includes('bash')) {
            // running an -alpine image
            await execa(
                'docker',
                [
                    'exec',
                    '-u=root',
                    containerName,
                    '/bin/sh',
                    '-c',
                    `"addgroup -S dnv && addgroup ${user} dnv"`,
                ],
                { shell: true }
            );
        } else {
            await execa(
                'docker',
                [
                    'exec',
                    '-u=root',
                    containerName,
                    '/bin/bash',
                    '-c',
                    `"groupadd dnv && usermod -aG dnv ${user}"`,
                ],
                { shell: true }
            );
        }
    } catch (err) {}
};

const killDnvProcesses = async (shell, containerName) => {
    try {
        if (!shell.includes('bash')) {
            await execa(
                'docker',
                [
                    'exec',
                    '-u=root',
                    containerName,
                    '/bin/sh',
                    '-c',
                    `"kill -9 $(ps o pid,group | grep dnv | awk '{print $1}' | xargs)"`,
                ],
                { shell: true }
            );
        } else {
            await execa(
                'docker',
                [
                    'exec',
                    '-u=root',
                    containerName,
                    '/bin/bash',
                    '-c',
                    '"pkill -G dnv"',
                ],
                {
                    shell: true,
                }
            );
        }
    } catch (err) {}
};

const getDependencies = (cwd) => {
    cwd = cwd || files.cwd;

    const pkg = files.getPackageJson(cwd);

    const deps = Object.keys(pkg.dependencies || {}).map((dep) => {
        return {
            category: 'prod',
            name: dep,
            cmd: dep,
        };
    });

    const devDeps = Object.keys(pkg.devDependencies || {}).map((dep) => {
        return {
            category: 'dev',
            name: dep,
            cmd: dep,
        };
    });

    return [...deps, ...devDeps];
};

const getReadmeString = async (packageName, cwd) => {
    cwd = cwd || files.cwd;

    if (fs.existsSync(cwd + '/.yarn/cache')) {
        const rdme = await getYarn2ReadmeString(packageName, cwd);
        if (rdme && typeof rdme === 'string') {
            return rdme;
        }

        return 'No such lick';
    }

    const pkgPath = `${cwd}/node_modules/${packageName}/`;

    if (fs.existsSync(`${pkgPath}README.md`)) {
        return fs.readFileSync(`${pkgPath}README.md`, 'utf-8');
    } else if (fs.existsSync(`${pkgPath}readme.md`)) {
        return fs.readFileSync(`${pkgPath}readme.md`, 'utf-8');
    } else if (fs.existsSync(`${pkgPath}Readme.md`)) {
        return fs.readFileSync(`${pkgPath}Readme.md`, 'utf-8');
    }

    return '';
};

const getYarn2ReadmeString = async (packageName, cwd) => {
    const zips = fs
        .readdirSync(cwd + '/.yarn/cache')
        .filter((f) => f !== '.' && f !== '..' && f !== '.gitignore');

    zips.sort().reverse();

    let zip;

    for (const fname of zips) {
        if (fname.includes(`${packageName}-npm`)) {
            zip = `${cwd}/.yarn/cache/${fname}`;
            break;
        }
    }

    if (!zip) {
        return '';
    }

    zip = new StreamZip.async({ file: zip, storeEntries: true });

    const possible = ['README.md', 'readme.md', 'Readme.md'];

    let readme;

    while (!readme) {
        if (possible.length === 0) {
            break;
        }

        const readmeFile = possible.shift();

        try {
            readme = await zip.entryData(
                `node_modules/${packageName}/${readmeFile}`
            );
        } catch {}

        if (readme && readme.toString) {
            readme = readme.toString();
        }
    }

    if (!readme) {
        return '';
    }

    return readme;
};

module.exports = {
    getAlpineInstallsAfterDate,
    getAptInstallsAfterDate,
    getNpmGlobalInstalls,
    getYarnV1GlobalInstalls,
    getPackageScripts,
    getShellScripts,
    createDnvGroup,
    killDnvProcesses,
    getReadmeString,
    getDependencies,
};
