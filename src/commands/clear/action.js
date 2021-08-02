const all = require('./all');
const docker = require('./docker');
const reset = require('./reset');
const { config } = require('../../lib/config');
const { files } = require('../../lib/files');

const { success, error } = require('../../lib/text');

const clearAction = async function (opts = {}) {
    const isSet = config.isProjectConfigSet();
    let pathKey = null;

    if (isSet) {
        const project = config.getProjectConfig();
        pathKey = project.pathKey;
    }

    if (opts.dependencies) {
        if (files.fileExists('node_modules')) {
            files.deleteFile('node_modules');
        }

        if (files.fileExists('.yarn')) {
            files.deleteFile('.yarn');
        }

        if (files.fileExists('.yarnrc.yml')) {
            files.deleteFile('.yarnrc.yml');
        }

        if (files.fileExists('.pnp.js')) {
            files.deleteFile('.pnp.js');
        } else if (files.fileExists('.pnp.cjs')) {
            files.deleteFile('.pnp.cjs');
        }

        if (files.fileExists('yarn.lock')) {
            files.deleteFile('yarn.lock');
        }

        if (files.fileExists('package-lock.json')) {
            files.deleteFile('package-lock.json');
        }

        return;
    } else if (opts.project) {
        if (!config.isProjectConfigSet()) {
            error('Project not initialized');
            process.exit(0);
        }

        await all(false, pathKey, true, opts.force);
        success('Docker objects and config cleared');
        return;
    } else if (opts.select) {
        await all(false, opts.force ? pathKey : null, true, opts.force);
        success('Docker objects and config cleared');
        return;
    } else if (opts.docker) {
        await docker(false, opts.force ? pathKey : null, true, opts.force);
        success('Docker objects cleared');
        return;
    } else if (opts.reset) {
        await reset();
        success("It's...It's all gone. There's nothing left.");
        return;
    }
};

module.exports = clearAction;
