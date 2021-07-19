const fs = require('fs');
const md5 = require('md5');

const prepPath = (path) => {
    if (path === '.' || !path) {
        path = './';
    }

    if (path.includes('./') || path.includes('..')) {
        path = fs.realpathSync(path);
    }

    return path;
};

const hashDeps = (pkgPath) => {
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, { encoding: 'utf-8' }));

        const deps = {
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {},
            peerDependencies: pkg.peerDependencies || {},
        };

        return md5(JSON.stringify(deps));
    }

    return null;
};

module.exports = {
    hashDeps,
    prepPath,
};
