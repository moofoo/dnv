//From https://github.com/croquiscom/rinore

const path = require('path');

const context = {};
const modules = [];
const activeReplServers = [];

function camelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
        if (+match === 0) return ''; // or if (/\s+/.test(match)) for white spaces
        return index === 0 ? match.toLowerCase() : match.toUpperCase();
    });
}

function splitModuleName(nodeModule) {
    if (nodeModule.lastIndexOf(':') >= 0) {
        const pos = nodeModule.lastIndexOf(':');
        return [nodeModule.substr(0, pos), nodeModule.substr(pos + 1)];
    } else {
        return [nodeModule, ''];
    }
}

function setupContext(replServer) {
    for (const key in context) {
        if (Object.prototype.hasOwnProperty.call(context, key)) {
            replServer.context[key] = context[key];
        }
    }
    replServer.on('exit', () => {
        const pos = activeReplServers.indexOf(replServer);
        if (pos >= 0) {
            activeReplServers.splice(pos, 1);
        }
    });
    activeReplServers.push(replServer);
}

function loadModule(moduleToLoad, name, local) {
    if (!moduleToLoad || moduleToLoad.trim() === '') {
        return;
    }

    if (!name) {
        name = camelCase(path.parse(moduleToLoad).name);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require(moduleToLoad);
    const members = [];
    if (name === '*') {
        for (const key in loaded) {
            if (Object.prototype.hasOwnProperty.call(loaded, key)) {
                context[key] = loaded[key];
                members.push(key);
            }
        }
    } else {
        context[name] = loaded;
    }
    modules.push({ module: moduleToLoad, name, members });
}

function loadModules(modulesToLoad, options = { silent: false }) {
    const cwd = process.cwd();
    if (modulesToLoad.length) {
        process.stdout.write('Loading modules ');
    }
    for (let moduleToLoad of modulesToLoad) {
        let name = '';
        [moduleToLoad, name] = splitModuleName(moduleToLoad);
        if (!options.silent) {
            if (name) {
                process.stdout.write(`${moduleToLoad} as '${name}' `);
            } else {
                process.stdout.write(`${moduleToLoad} `);
            }
        }
        try {
            // try to load local file first
            const localPath = path.resolve(cwd, moduleToLoad);
            loadModule(localPath, name, true);
        } catch (error1) {
            if (error1.code === 'MODULE_NOT_FOUND') {
                try {
                    // try to load npm module (local or global)
                    loadModule(moduleToLoad, name, false);
                } catch (error2) {
                    console.log(error2.toString());
                }
            } else {
                console.log(error1.toString());
            }
        }
    }

    process.stdout.write('\n');
}

module.exports = {
    loadModules,
    setupContext,
};
