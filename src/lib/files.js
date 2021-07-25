const md5 = require('md5');
const fg = require('fast-glob');
const fs = require('fs');
const sep = require('path').sep;
const path = require('path');
const { EventEmitter } = require('events');
const { findDeps, findYarn2Deps } = require('./find-deps');
const execa = require('execa');

const regex = /[!"#$%&'()*+,./:;<=>?@[\]^`{|}~\\ ]/g;

const format = (string) => {
    return (string || '').replace(regex, '_').toLocaleLowerCase();
};

const random = (min = 1000, max = 9999) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

console.logAndQuit = (...args) => {
    console.log(...args);
    if (1 === 1) {
        process.exit(0);
    }
};

console.stringifyAndQuit = (obj) => {
    console.log(JSON.stringify(obj, null, 4));
    if (1 === 1) {
        process.exit(0);
    }
};

class Files extends EventEmitter {
    constructor(options = {}) {
        super(options);

        let cwd;

        process.argv.forEach((arg, index) => {
            if (arg.includes('--cwd')) {
                cwd = arg.split('--cwd=')[1];
            }
        });

        this._cwd = cwd || options.cwd || process.cwd();

        this.uniqueNames = new Map();
        this.pathKeys = new Map();
    }

    get cwd() {
        return this._cwd;
    }

    set cwd(p) {
        this._cwd = p;
        this.emit('change');
    }

    format(string) {
        return (string || '').replace(regex, '_').toLocaleLowerCase();
    }

    getFormattedPath(cwd) {
        cwd = cwd || this.cwd;

        return format(cwd);
    }

    getDir(cwd) {
        cwd = cwd || this.cwd;

        const base = path.basename(cwd);

        if (base.includes('.')) {
            return path.basename(base);
        }

        return base;
    }

    getFormattedDir(cwd) {
        cwd = cwd || this.cwd;
        return format(this.getDir(cwd));
    }

    getFullFile(file, cwd) {
        cwd = cwd || this.cwd;

        if (file && file.includes(cwd)) {
            return file;
        }

        if (file === '.' || !file) {
            file = './';
        } else {
            const filename = this.getFileName(file);

            if (file === filename) {
                return `${cwd}/${file}`;
            }
        }

        if (file.includes('./') || file.includes('..')) {
            file = fs.realpathSync(file);
        }

        return file;
    }

    getFilePath(file, cwd) {
        cwd = cwd || this.cwd;

        if (!file.includes(sep) && !file.includes('/')) {
            return this.cwd;
        }

        let path = this.getFullFile(file, cwd);

        path = path.substr(0, path.lastIndexOf(sep));

        return path.substr(0, path.lastIndexOf('/'));
    }

    getFileName(file) {
        return path.basename(file);
    }

    getRelativeFile(file, cwd) {
        cwd = cwd || this.cwd;
        const filename = this.getFileName(file);
        return './' + filename;
    }

    fileExists(filepath, cwd) {
        cwd = cwd || this.cwd;
        let file;
        let exists = true;
        if (Array.isArray(filepath)) {
            filepath.forEach((fp) => {
                file = this.getFullFile(fp, cwd);

                if (!fs.existsSync(file)) {
                    exists = false;
                }
            });
        } else {
            file = this.getFullFile(filepath, cwd);
            exists = fs.existsSync(file);
        }

        return exists;
    }

    deleteFile(file, cwd) {
        cwd = cwd || this.cwd;

        file = this.getFullFile(file, cwd);
        if (fs.existsSync(file)) {
            execa.commandSync(`rm -rdf ${file}`, {
                cwd: files.cwd,
            });

            return true;
        }

        return false;
    }

    getPathKey(cwd) {
        cwd = cwd || this.cwd;
        const key = this.pathKeys.get(cwd) || md5(cwd);
        this.pathKeys.set(cwd, key);
        return key;
    }

    getUniqueName(suffix, name, cwd) {
        cwd = cwd || this.cwd;

        if (!name) {
            name = this.uniqueNames.get(cwd);
        }

        if (!name) {
            const formattedDir = this.getFormattedDir(cwd);
            const num = random();
            name = `${formattedDir}${num}`;
        }

        this.uniqueNames.set(cwd, name);

        if (suffix) {
            return `${name}_${suffix}`;
        }

        return name;
    }

    getShortPath(cwd) {
        cwd = cwd || this.cwd;

        cwd = cwd.replace('/', sep);

        const split = cwd.split(sep);

        if (split.length >= 3) {
            return `${split[split.length - 2]}/${split[split.length - 1]}`;
        }

        return `${split[split.length - 1]}`;
    }

    hasPackageJson(cwd) {
        cwd = cwd || this.cwd;
        return fs.existsSync(`${cwd}/package.json`);
    }

    getPackageJson(cwd) {
        cwd = cwd || this.cwd;
        if (this.hasPackageJson(cwd)) {
            const pkg = require(`${cwd}/package.json`);
            return pkg;
        }

        return null;
    }

    getLockFile(packageManager = 'npm') {
        return packageManager === 'npm'
            ? 'package-lock.json'
            : packageManager === 'yarn'
            ? 'yarn-lock.json'
            : packageManager === 'pnpm'
            ? 'pnpm-lock.yml'
            : '';
    }

    getNpmFiles(packageManager = 'npm', cwd) {
        cwd = cwd || this.cwd;

        let files = ['package.json', this.getLockFile(packageManager)];

        if (packageManager === 'npm') {
            files.push('npm-shrinkwrap.json');
        }

        return files.filter((file) => {
            return this.fileExists(`${cwd}/${file}`, cwd);
        });
    }

    hasLockFile(packageManager, cwd) {
        cwd = cwd || this.cwd;

        if (packageManager) {
            return fs.existsSync(
                files.getFullFile(files.getLockFile(packageManager), cwd)
            );
        }

        const hasNpmLock = fs.existsSync(
            files.getFullFile(files.getLockFile('npm'), cwd)
        );
        if (hasNpmLock) {
            return true;
        }

        const hasYarnLock = fs.existsSync(
            files.getFullFile(files.getLockFile('yarn'), cwd)
        );
        if (hasYarnLock) {
            return true;
        }

        const hasPnpmLock = fs.existsSync(
            files.getFullFile(files.getLockFile('pnpm'), cwd)
        );
        if (hasPnpmLock) {
            return true;
        }

        return false;
    }

    initProjectData(existing = {}) {
        const pathKey = this.getPathKey();

        return {
            ...existing,
            path: this.cwd,
            shortPath: this.getShortPath(),
            pathKey,
            dir: this.getDir(),
            formattedDir: this.getFormattedDir(),
            name: this.getUniqueName(null, existing.name, this.cwd),
        };
    }

    fileTime(file, cwd) {
        cwd = cwd || this.cwd;
        return Math.floor(
            fs.statSync(file.includes(cwd) ? file : this.getFullFile(file, cwd))
                .mtimeMs / 1000
        );
    }

    async findDeps(deps, cwd, yarn2 = false) {
        cwd = cwd || this.cwd;

        let found;

        if (yarn2) {
            found = findYarn2Deps(deps);
        } else {
            found = await findDeps(deps, cwd);
        }

        if (found && found.length) {
            return found;
        }

        return [];
    }

    async getSubDirectoryPkgJson(cwd) {
        cwd = cwd || this.cwd;

        const paths = await fg
            .sync(['**/package.json', '!**/node_modules/**'], {
                onlyFiles: true,
                deep: 2,
                cwd: cwd,
            })
            .reduce(async (theFiles, file) => {
                const ff = await theFiles;

                if (file !== 'package.json' && file.includes('package.json')) {
                    file = this.getFullFile(file, cwd);

                    let sub = file.substr(
                        0,
                        file.lastIndexOf(sep + 'package.json')
                    );
                    file = sub !== '' ? sub : file;

                    sub = file.substr(
                        0,
                        file.lastIndexOf('/' + 'package.json')
                    );
                    file = sub !== '' ? sub : file;

                    return [...ff, file];
                }
                return ff;
            }, []);

        return paths;
    }

    async getMultiRepoPaths(cwd) {
        cwd = cwd || this.cwd;

        const paths = await this.getSubDirectoryPkgJson(cwd);

        if (paths.length) {
            return paths.reduce((acc, thePath) => {
                let dir = thePath.replace(this.cwd + sep, '');

                if (dir.includes('/')) {
                    dir = dir.replace(this.cwd + '/', '');
                }

                const formatted = format(dir);
                const pkgJsonPath = thePath + '/' + 'package.json';

                return [
                    ...acc,
                    {
                        path: thePath,
                        shortPath: this.getShortPath(thePath),
                        pkgJson: pkgJsonPath,
                        dir,
                        formatted,
                    },
                ];
            }, []);
        }

        return [];
    }
}

const files = new Files();

module.exports = {
    files,
    Files,
};
