const chokidar = require('chokidar');
const { restartContainer } = require('./docker/containers');

const pathToContainer = {};

const watch = (
    service,
    ignorePaths = [/(^|[\/\\])\../, '**/node_modules/**']
) => {
    if (Array.isArray(pathToContainer[service.path])) {
        service.watching = true;
        pathToContainer[service.path].push(service);
        return false;
    }

    service.watching = true;

    pathToContainer[service.path] = [service];

    const watcher = chokidar.watch('**/**', {
        ignored: ignorePaths,
        persistent: true,
        cwd: service.path,
        ignoreInitial: true,
        ignorePermissionErrors: true,
    });

    let restartTimeout = null;

    watcher.on('all', () => {
        clearTimeout(restartTimeout);

        restartTimeout = setTimeout(() => {
            const restarts = [];
            for (const watchedService of pathToContainer[service.path]) {
                if (watchedService.watching !== false) {
                    restarts.push(
                        restartContainer(watchedService.containerName)
                    );
                }
            }

            Promise.all(restarts);

            clearTimeout(restartTimeout);
        }, 250);
    });

    return true;
};
module.exports = watch;
