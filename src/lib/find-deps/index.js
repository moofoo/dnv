// adapted from https://github.com/laggingreflex/findep
const fs = require('fs');
const { setCwd, fromCwd, readJsonFromFile } = require('./utils');
const execa = require('execa');

let localInstalled = null;

const copyLocalTar = (service, toInstall, cwd) => {

    if (!service || !toInstall || toInstall === 'undefined') {
        return;
    }



    if (localInstalled === null) {
        const { stdout } = execa.commandSync(`npm list --global --json`, {
            stdio: 'pipe',
        });

        let globalList;

        try {

            globalList = stdout.trim();
            globalList = JSON.parse(globalList);

            localInstalled = Object.keys(globalList.dependencies);


        } catch { }

        setTimeout(() => {
            localInstalled = null;
        }, 3500)
    }

    if ((localInstalled || []).includes(toInstall)) {
        const { stdout, stderr } = execa.commandSync(`npm pack ${toInstall} --pack-destination ${cwd}`, {
            shell: true,
            stdio: 'pipe',
            cwd,
        });
        let filename = stdout.trim().replace('/', '-')

        execa.commandSync(`docker cp ${cwd}/${filename} ${service.containerName}:${service.workingDir}`);

        return filename;
    }

    return false;



};

const getCacheDir = service => {
    const { packageManager, yarnVersion } = service;
    let cacheDir = null;

    if (yarnVersion < 2) {
        const configCommand =
            packageManager === 'yarn'
                ? 'yarn cache dir'
                : 'npm config get cache';

        const { stdout } = execa.commandSync(configCommand, {
            stdio: 'pipe',
        });

        cacheDir = stdout;
    }

    return cacheDir;
};

const getPrefix = service => {
    const { stdout } = execa.commandSync('npm config get prefix', {
        stdio: 'pipe',
    });

    return stdout;
};

const findYarn2Deps = depsToFind => {
    forceInstalls = [];
    for (const dep of depsToFind) {
        let json;
        try {
            output = execa.commandSync(`yarn why ${dep} -R --json`, {
                stdio: 'pipe',
            });
            if (output.stdout) {
                json = JSON.parse(output.stdout);
            }
        } catch { }

        if (typeof json === 'object') {
            forceInstalls.push(dep);
        }
    }

    return forceInstalls;
};

const findDeps = (depsToFind, cwd) => {
    return new Promise(mainResolve => {
        const getDeps = pkg =>
            Object.assign(
                {},
                pkg.dependencies,
                pkg.devDependencies || {},
                pkg.peerDependencies || {},
                {}
            );

        cwd = cwd || process.cwd();

        setCwd(cwd);

        const depsChecked = [];
        const foundDeps = [];

        if (!fs.existsSync(`${cwd}/package.json`)) {
            return [];
        }

        const pkg = require(`${cwd}/package.json`);

        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        const peerDeps = Object.keys(pkg.peerDependencies || {});

        for (const dep of deps) {
            if (depsToFind.includes(dep) && !foundDeps.includes(dep)) {
                depsChecked.push(dep);
                foundDeps.push(dep);
                depsToFind = depsToFind.filter(val => val !== dep);
            }
        }

        for (const dep of devDeps) {
            if (depsToFind.includes(dep) && !foundDeps.includes(dep)) {
                depsChecked.push(dep);
                foundDeps.push(dep);
                depsToFind = depsToFind.filter(val => val !== dep);
            }
        }

        for (const dep of peerDeps) {
            if (depsToFind.includes(dep) && !foundDeps.includes(dep)) {
                depsChecked.push(dep);
                foundDeps.push(dep);
                depsToFind = depsToFind.filter(val => val !== dep);
            }
        }

        const loop = (deps, pDeps) =>
            Promise.all(
                Object.entries(deps).map(
                    ([dep, ver]) =>
                        new Promise((resolve, reject) => {
                            if (depsChecked.includes(dep)) {
                                return resolve();
                            } else {
                                depsChecked.push(dep);
                            }

                            let getJson = Promise.resolve();

                            getJson = getJson.then(() =>
                                readJsonFromFile(
                                    fromCwd('node_modules', dep, 'package.json')
                                )
                            );

                            getJson = getJson.catch(err => ({}));

                            getJson.then(pkg => {
                                // log(pkg);
                                if (!pkg) {
                                    return resolve();
                                }
                                const deps = getDeps(pkg);
                                Promise.all(
                                    depsToFind.map(
                                        depToFind =>
                                            new Promise((resolve, reject) => {
                                                if (depToFind in deps) {
                                                    const include =
                                                        (pDeps
                                                            ? pDeps.join(
                                                                ' > '
                                                            ) +
                                                            ' > ' +
                                                            dep
                                                            : dep) +
                                                        ' > ' +
                                                        depToFind;
                                                    if (
                                                        !foundDeps.includes(
                                                            include
                                                        )
                                                    ) {
                                                        foundDeps.push(include);
                                                    }
                                                }

                                                return loop(
                                                    deps,
                                                    (pDeps || []).concat([dep])
                                                ).then(resolve, reject);
                                            })
                                    )
                                ).then(resolve, reject);
                            });
                        })
                )
            );

        const mainPromise = readJsonFromFile(fromCwd('package.json'))
            .then(getDeps)
            .then(loop);

        mainPromise.catch(console.error).then(() => {
            if (foundDeps.length) {
                mainResolve(
                    foundDeps.map(dep => {
                        return dep.split(' > ')[0];
                    })
                );
            }

            return mainResolve([]);
        });
    });
};

module.exports = {
    findDeps,
    findYarn2Deps,
    getCacheDir,
    copyLocalTar,
};
