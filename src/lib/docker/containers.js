const { getDocker } = require('./util');
const Docker = require('dockerode');
const execa = require('execa');
const { files } = require('../files');

const getContainer = async (containerName, docker) => {
    const state = await getContainerState(containerName, docker);
    let container = null;
    if (state.exists) {
        if (docker) {
            container = await docker.getContainer(containerName);
        } else {
            container = await getDocker().getContainer(containerName);
        }
    }

    return [container, state];
};

const getContainerName = (suffix = 'container') => {
    return files.getUniqueName(suffix);
};

const inspectContainer = async (containerName) => {
    const { stdout } = await execa.command(
        `docker container inspect ${containerName}`
    );

    if (stdout) {
        return JSON.parse(stdout)[0];
    }

    return {};
};

const getContainerStateSync = (containerName, all = false) => {
    let output;

    let state = {
        exists: true,
        running: false,
        paused: false,
        restarting: false,
        dead: false,
        status: '',
        autoRemove: false,
    };

    try {
        output = execa.commandSync(
            `docker container inspect ${containerName}`,
            {
                cwd: files.cwd,
            }
        );
    } catch (err) {
        output = err;
        state.exists = false;
    }

    const info = JSON.parse(output.stdout)[0];

    if (all) {
        return info;
    }

    if (info) {
        state.exists = true;
        state.running = info.State.Running;
        state.paused = info.State.Paused;
        state.restarting = info.State.Restarting;
        state.startedAt = info.State.StartedAt;
        state.dead = info.State.Dead;
        state.status = info.State.Status;
        state.autoRemove = info.HostConfig.AutoRemove;
        state.exitCode = info.State.ExitCode;
        state.error = info.State.Error;
    }

    return state;
};

const getContainerState = async (containerName, docker) => {
    let state = {
        exists: false,
        running: false,
        paused: false,
        restarting: false,
        dead: false,
        status: '',
        autoRemove: false,
    };

    try {
        let container;
        if (docker) {
            container = await docker.getContainer(containerName);
        } else {
            container = await getDocker().getContainer(containerName);
        }

        if (container) {
            const info = await container.inspect();

            if (info) {
                state.exists = true;
                state.running = info.State.Running;
                state.paused = info.State.Paused;
                state.restarting = info.State.Restarting;
                state.startedAt = info.State.StartedAt;
                state.dead = info.State.Dead;
                state.status = info.State.Status;
                state.autoRemove = info.HostConfig.AutoRemove;
            }
        }
    } catch (err) {
        if (err.reason !== 'no such container') {
            console.error(err);
            process.exit(1);
        }
    }

    return state;
};

const removeContainer = async (containerName, kill = false) => {
    containerName = containerName || getContainerName();

    const state = getContainerStateSync(containerName);
    if (state.exists) {
        const container = await getDocker().getContainer(containerName);
        if (state.running) {
            if (kill) {
                await container.kill();
            } else {
                await container.stop();
            }
        }
        if (!state.autoRemove) {
            await container.remove({ force: true });
        }
    }
};

const removeCon = async (containerName) => {
    const container = await getDocker().getContainer(containerName);
    const state = getContainerStateSync(containerName);

    if (state.exists) {
        if (state.running) {
            await container.kill();
        }

        await container.remove({ force: true });
    }
};

const removeContainers = async (containers, kill = false) => {
    await Promise.all(containers.map((container) => removeCon(container)));
};

const removeContainerCli = (containerName) => {
    if (!Array.isArray(containerName)) {
        containerName = [containerName];
    }
    execa.commandSync(`docker container rm -f -v ${containerName.join(' ')}`, {
        stdio: 'pipe',
    });
};

const killContainer = async (containerName) => {
    const state = await getContainerState(containerName);
    if (state.exists && state.running) {
        const container = await getDocker().getContainer(containerName);
        await container.kill();
    }
};

const stopContainer = async (containerName) => {
    const state = await getContainerState(containerName);
    if (state.exists && state.running) {
        const container = await getDocker().getContainer(containerName);
        await container.stop();
    }
};

const restartContainer = (containerName) => {
    return new Promise(async (resolve, reject) => {
        const [container, state] = await getContainer(containerName);

        if (!container) {
            reject(`${containerName} does not exist`);
        }

        if (state.running) {
            container.restart((err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve();
            });
        } else if (container) {
            container.start((err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve();
            });
        }
    });
};

const startContainer = (containerName, restart = false) => {
    return new Promise(async (resolve, reject) => {
        const [container, state] = await getContainer(containerName);

        if (!container) {
            reject(`${containerName} does not exist`);
        }

        if (state.running) {
            if (restart) {
                container.stop((err, data) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    container.start((err2, data2) => {
                        if (err2) {
                            reject(err2);
                            return;
                        }
                        resolve([container, state, data2]);
                    });
                });
            } else {
                resolve([container, state, null]);
            }

            return;
        }

        container.start(function (err, data) {
            if (err) {
                reject(err);
                return;
            }

            resolve([container, { ...state, running: true }, data]);
        });
    });
};

const listContainers = async (containers) => {
    const docker = new Docker();

    let list = await docker.listContainers({
        all: true,
        filters: {
            name: containers,
        },
    });

    if (list.length) {
        let index = 0;
        for (const data of list) {
            const name = data.Names[0].replace('/', '');
            const state = getContainerStateSync(name);
            list[index].StartedAt = new Date(state.startedAt).getTime() / 1000;
            list[index].state = state;
            list[index].error = state.error;
            index++;
        }
    }

    return list;
};

const getContainerList = async (labels = {}) => {
    labels = Object.keys(labels).reduce((acc, curr) => {
        return [...acc, `${curr}=${labels[curr]}`];
    }, []);

    const list = await getDocker().listContainers({
        all: true,
        filters: { label: ['is-dnv', ...labels] },
    });

    return list;
};

const removeContainersByLabel = async (labels = {}) => {
    labels = Object.keys(labels).reduce((acc, curr) => {
        return [...acc, `${curr}=${labels[curr]}`];
    }, []);

    const list = await getDocker().listContainers({
        all: true,
        filters: { label: ['is-dnv', ...labels] },
    });

    if (list && list.length) {
        let names = [];
        for (const container of list) {
            const name = container.Names[0].replace('/', '');
            names.push(name);
        }

        await removeContainerCli(names);
    }
};

const removeProjectContainers = async (projectName) => {
    await removeContainersByLabel({ 'project-name': projectName });
};

const commitContainer = async (containerName, imageName, done) => {
    await execa.command(
        `docker container commit -a dnv ${containerName} ${imageName}`,
        {
            stdio: 'pipe',
        }
    );

    done(imageName);
};

const removeDnvContainers = async () => {
    const list = await getDocker().listContainers({
        all: true,
        filters: { label: ['is-dnv'] },
    });

    if (list && list.length) {
        await Promise.all(
            list.map((container) =>
                removeCon(container.Names[0].replace('/', ''))
            )
        );
    }
};

module.exports = {
    getContainer,
    getContainerName,
    getContainerState,
    getContainerStateSync,
    startContainer,
    restartContainer,
    stopContainer,
    killContainer,
    removeContainer,
    removeContainers,
    removeContainerCli,
    listContainers,
    removeProjectContainers,
    removeContainersByLabel,
    getContainerList,
    commitContainer,
    removeDnvContainers,
    inspectContainer,
};
