const all = require('./all');
const docker = require('./docker');
const reset = require('./reset');
const { config } = require('../../lib/config');
const { files } = require('../../lib/files');

const { success, error } = require('../../lib/text');
const { fstat } = require('fs-promise');

const clearAction = async function (opts = {}) {
    const isSet = config.isProjectConfigSet();
    let pathKey = null;

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
        }

        if (files.fileExists('yarn.lock')) {
            files.deleteFile('yarn.lock');
        }

        if (files.fileExists('package-lock.json')) {
            files.deleteFile('package-lock.json');
        }

        return;
    }

    if (isSet) {
        const project = config.getProjectConfig();
        pathKey = project.pathKey;
    }

    if (opts.project) {
        if (!config.isProjectConfigSet()) {
            error('Project not initialized');
            process.exit(0);
        }

        await all(false, pathKey, true, opts.force);
        success('Docker objects and config cleared');
        return;
    }

    if (opts.all) {
        await all(false, opts.force ? pathKey : null, true, opts.force);
        success('Docker objects and config cleared');
        return;
    }

    if (opts.docker) {
        await docker(false, opts.force ? pathKey : null, true, opts.force);
        success('Docker objects cleared');
        return;
    }

    if (opts.reset) {
        await reset();
        success("It's...It's all gone. There's nothing left.");
        return;
    }
};

module.exports = clearAction;
