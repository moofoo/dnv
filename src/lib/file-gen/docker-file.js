const fs = require('fs');
const path = require('path');
const sep = path.sep;
const { files } = require('../files');
const { prepPath } = require('./util');

class DockerFile {
    static cache = {};

    static exists(filename = 'Dockerfile', context = './') {
        context = prepPath(context);
        const path = `${context}/${filename}`;

        if (fs.existsSync(path)) {
            return path;
        }

        return false;
    }

    static getInstance(filename = 'Dockerfile', context = './', parse = true) {
        filename = path.basename(filename);

        if (!filename.includes('Dockerfile')) {
            filename = 'Dockerfile';
        }

        context = prepPath(context);

        if (fs.existsSync(context + '/' + filename)) {
            const df = new DockerFile(filename, context, parse);

            return df;
        }

        return null;
    }

    constructor(
        filename = 'Dockerfile',
        context = './',
        args = {},
        parse = true
    ) {
        this.filename = filename;
        this.args = args;

        context = prepPath(context);

        this.context = context;
        this.path = context + '/' + filename;

        if (parse) {
            this.parse();
        }
    }

    parse() {
        const fg = require('fast-glob');

        const {
            DockerfileParser,
            User,
            Workdir,
            Copy,
            Cmd,
        } = require('dockerfile-ast');

        const content = fs.readFileSync(this.path, { encoding: 'utf-8' });

        const dockerfile = DockerfileParser.parse(content);

        const dfRange = dockerfile.getRange();

        const froms = dockerfile.getFROMs();
        const workdirs = dockerfile.getWORKDIRs();

        let wdFirst = '';

        for (const wd of workdirs) {
            const path = wd.getAbsolutePath().substr(1);

            if (path.includes('/')) {
                wdFirst = path.substr(0, path.indexOf('/'));
            } else {
                wdFirst = path.substr(0, path.indexOf(sep));
            }
            break;
        }

        this.wdFirst = wdFirst;

        const stages = {};

        const stageNames = [];

        const ranges = [];

        let x = 0;

        if (froms.length === 1) {
            ranges.push(dfRange);
        } else {
            for (const from of froms) {
                const image = from.getImage();
                if (image.includes('node')) {
                    const range = from.getBuildStageRange();

                    if (x > 0) {
                        ranges[x - 1].end.line = range.start.line;
                    }

                    ranges.push(range);

                    x++;
                }
            }

            ranges[ranges.length - 1].end.line = dfRange.end.line;
        }

        x = 0;

        const instructions = dockerfile.getInstructions();

        for (const from of froms) {
            const image = from.getImage();
            if (image.includes('node')) {
                const stage = from.getBuildStage() || 'default';

                stageNames.push(stage);

                stages[stage] = {
                    image,
                    copys: [],
                    workdirs: [],
                    commands: [],
                };

                const range = ranges[x];

                const wdMap = new Map();

                for (const instruction of instructions) {
                    if (instruction instanceof User) {
                        stages[stage].user = instruction
                            .getTextContent()
                            .replace('USER', '')
                            .trim();
                    }

                    if (instruction instanceof Workdir) {
                        const workdir = instruction;

                        const wdRange = workdir.getRange();
                        if (
                            !range ||
                            (wdRange.start.line > range.start.line &&
                                wdRange.end.line < range.end.line)
                        ) {
                            if (wdMap.has(range)) {
                                const arr = wdMap.get(range);
                                arr.push(workdir);
                                wdMap.set(range, arr);
                            } else {
                                wdMap.set(range, [workdir]);
                            }

                            stages[stage].workdirs.push(
                                workdir.getAbsolutePath()
                            );
                        }
                    }

                    if (instruction instanceof Copy) {
                        const copy = instruction;

                        const cpyRange = copy.getRange();
                        if (
                            !range ||
                            (cpyRange.start.line >= range.start.line &&
                                cpyRange.end.line <= range.end.line)
                        ) {
                            let args;
                            if (
                                copy.getTextContent().includes('[') &&
                                copy.getTextContent().includes(']')
                            ) {
                                args = JSON.parse(copy.getArgumentsContent());
                            } else {
                                args = copy.getArguments();
                            }

                            let to = args.pop();
                            if (typeof to === 'string') {
                                to = {
                                    value: to,
                                };
                            }

                            for (const wd of wdMap.get(range).reverse()) {
                                if (cpyRange.start.line > wd.range.start.line) {
                                    const wdPath = wd.getAbsolutePath();
                                    if (to.value === '.' || to.value === './') {
                                        to = wdPath;
                                        break;
                                    } else if (to.value.substr(0, 1) === '/') {
                                        to = to.value;
                                        break;
                                    }

                                    const wdSplit = wdPath.split('/');

                                    let toValue = to.value;

                                    for (const split of wdSplit) {
                                        toValue = toValue
                                            .replace(split, '')
                                            .replace('//', '/');
                                    }

                                    if (toValue.substr(0, 1) === '/') {
                                        toValue = wdPath + toValue;
                                    } else {
                                        toValue = wdPath + '/' + toValue;
                                    }

                                    to = toValue;
                                    break;
                                }
                            }

                            if (
                                to.substr(-1) === '/' ||
                                to.substr(-1) === sep
                            ) {
                                to = to.substr(0, to.length - 1);
                            }

                            args = args.map((arg) => {
                                let value = arg.value || arg;

                                if (value === '.' || value === './') {
                                    value = this.context;
                                } else if (value.substr(0, 1) === '/') {
                                    value = this.context + value;
                                } else {
                                    value = this.context + '/' + value;
                                }

                                if (
                                    value.substr(-1) === '/' ||
                                    value.substr(-1) === sep
                                ) {
                                    value = value.substr(0, value.length - 1);
                                }

                                return value;
                            });

                            const fromPaths = [];

                            for (let from of args) {
                                if (from.includes('*')) {
                                    from = fg
                                        .sync([from, '!**/node_modules/**'], {
                                            deep: 2,
                                            cwd: this.context,
                                            dot: true,
                                        })
                                        .forEach((file) => {
                                            fromPaths.push(file);
                                        });
                                } else {
                                    fromPaths.push(from);
                                }
                            }

                            stages[stage].copys.push({
                                from: fromPaths
                                    .map((path) =>
                                        path
                                            .replace(
                                                RegExp(wdFirst + '/', 'g'),
                                                '/'
                                            )
                                            .replace('//', '/')
                                    )
                                    .flat(),
                                to,
                            });
                        }
                    }

                    if (instruction instanceof Cmd) {
                        const command = instruction;

                        let content;
                        if (
                            command.getTextContent().includes('[') &&
                            command.getTextContent().includes(']')
                        ) {
                            content = JSON.parse(command.getArgumentsContent());
                        } else {
                            content = command.getArguments();
                        }

                        if (Array.isArray(content)) {
                            stages[stage].command = content.join(' ');
                        } else {
                            stages[stage].command = content;
                        }

                        const cmdRange = command.getRange();
                        if (
                            !range ||
                            (cmdRange.start.line >= range.start.line &&
                                cmdRange.end.line <= range.end.line)
                        ) {
                            if (command.getTextContent().includes('npm')) {
                                stages[stage].packageManager = 'npm';
                            } else if (
                                command.getTextContent().includes('yarn')
                            ) {
                                stages[stage].packageManager = 'yarn';
                            } else {
                                stages[stage].packageManager = null;
                            }
                        }
                    }
                }

                x++;
            }
        }

        const allWorkingDir = [];

        for (const [name, info] of Object.entries(stages)) {
            if (info.workdirs.length === 1) {
                stages[name].workingDir = info.workdirs[0];
            } else if (info.workdirs.length > 1) {
                stages[name].workingDir =
                    info.workdirs[info.workdirs.length - 1];
            }

            if (stages[name].workingDir) {
                allWorkingDir.push(stages[name].workingDir);
            }
        }

        this.stageNames = stageNames;

        this.stages = stages;

        this.allWorkingDir = allWorkingDir;

        this.makeContainerFS();
    }

    makeContainerFS(stages) {
        stages = stages || this.stages;

        this.containerFS = this.containerFS || [];

        for (const stage of Object.values(stages)) {
            this.containerFS = [...this.containerFS, stage.workingDir];

            for (const copy of stage.copys) {
                this.addPath(copy.from, copy.to);
            }
        }

        for (let [container, host] of Object.entries(this.localLookup)) {
            if (container.includes('/')) {
                container = container.substr(0, container.lastIndexOf('/'));
            } else {
                container = container.substr(0, container.lastIndexOf(sep));
            }

            if (host.includes('/')) {
                host = host.substr(0, host.lastIndexOf('/') + 1);
            } else {
                host = host.substr(0, host.lastIndexOf(sep) + 1);
            }

            host = host.replace(/\/\//g, '/');
            container = container.replace(/\/\//g, '/');

            if (host.substr(-1) === '/' || host.substr(-1) === sep) {
                host = host.substr(0, host.length - 1);
            }

            if (container.substr(-1) === '/' || container.substr(-1) === sep) {
                container = container.substr(0, container.length - 1);
            }

            if (!this.localLookup[container]) {
                this.localLookup[container] = host;
            }
        }

        this.uniquePaths();
    }

    addPath(copyFrom, copyTo) {
        this.containerFS = this.containerFS || [];
        this.localLookup = this.localLookup || {};

        if (!['.', './', '../'].includes(copyTo)) {
            if (!this.containerFS.includes(copyTo)) {
                this.containerFS.push(copyTo);
            }
        }

        if (!copyFrom) {
            return;
        }

        copyFrom = Array.isArray(copyFrom) ? copyFrom : [copyFrom];

        for (let from of copyFrom) {
            if (from === '.' || from === './') {
                from = this.context;
            }

            let last;
            if (from.includes('/')) {
                last = from.substr(from.lastIndexOf('/') + 1).trim();
            } else {
                last = from.substr(from.lastIndexOf(sep) + 1).trim();
            }

            if (last !== '' && last.includes('.')) {
                if (!this.containerFS.includes(copyTo + '/' + last)) {
                    this.containerFS.push(copyTo + '/' + last);

                    this.localLookup[copyTo + '/' + last] = from;
                }
            } else {
                if (fs.existsSync(from)) {
                    const contents = fs
                        .readdirSync(from, { withFileTypes: true })
                        .filter(
                            (dir) =>
                                dir.name !== '.' &&
                                dir.name !== '..' &&
                                dir.name !== ''
                        );

                    for (const filedir of contents) {
                        if (
                            !this.containerFS.includes(
                                copyTo + '/' + filedir.name
                            )
                        ) {
                            if (
                                filedir.isDirectory() &&
                                filedir.name !== 'node_modules'
                            ) {
                                const contents2 = fs
                                    .readdirSync(from + '/' + filedir.name, {
                                        withFileTypes: true,
                                    })
                                    .filter(
                                        (dir) =>
                                            dir.name !== '.' &&
                                            dir.name !== '..' &&
                                            dir.name !== ''
                                    );
                                for (const filedir2 of contents2) {
                                    if (
                                        !this.containerFS.includes(
                                            copyTo +
                                            '/' +
                                            filedir.name +
                                            '/' +
                                            filedir2.name
                                        )
                                    ) {
                                        this.containerFS.push(
                                            copyTo +
                                            '/' +
                                            filedir.name +
                                            '/' +
                                            filedir2.name
                                        );
                                        this.localLookup[
                                            copyTo +
                                            '/' +
                                            filedir.name +
                                            '/' +
                                            filedir2.name
                                        ] =
                                            from +
                                            '/' +
                                            filedir.name +
                                            '/' +
                                            filedir2.name;
                                    }
                                }
                            }

                            this.containerFS.push(copyTo + '/' + filedir.name);
                            this.localLookup[copyTo + '/' + filedir.name] =
                                from + '/' + filedir.name;
                        }
                    }
                }
            }
        }
    }

    uniquePaths() {
        this.containerFS = this.containerFS.filter(
            (item, i, ar) => ar.indexOf(item) === i
        );

        return this.containerFS;
    }

    static validate(dockerfile) {
        const { validate } = require('dockerfile-utils');

        let valid = [];
        let msg = '';

        if (fs.existsSync(dockerfile)) {
            const file = fs.readFileSync(dockerfile, { encoding: 'utf-8' });

            valid = validate(file);

            msg = '';

            if (valid.length > 0) {
                msg = `${chalk.bold.red('Validation Error')}\n`;
                msg += `file: ${file}\n`;
                msg += valid.reduce((acc, curr) => {
                    return acc + '- ' + curr.message + '\n';
                }, '');
            }
        }

        return {
            valid: valid.length === 0,
            msg,
        };
    }

    static createGenericDockerfile({
        nodeImage = null,
        packageManager = 'npm',
        yarnVersion = 1,
        script = 'start',
        filename = 'Dockerfile',
        workingDir = '/usr/src/app',
        cwd = files.cwd,
        nodeUser = false,
        multiRepo = false,
        dir = '',

    }) {
        if (nodeImage === null) {
            throw new Error('createGenericDockerfile nodeImage option missing');
        }

        let copy;

        const install =
            packageManager === 'npm'
                ? `${packageManager} install --update-notifier=false --progress=false --fund=false --audit=false --color=false\n\n`
                : `${packageManager} install\n\n`;

        if (packageManager === 'yarn') {
            if (fs.existsSync(`${cwd}/.yarnrc.yml`)) {
                copy =
                    'COPY ["package.json", "yarn.lock*", ".yarnrc.yml*",".pnp.cjs*", ".pnp.js*", "./"]\n\n';

                if (fs.existsSync(`${cwd}/.yarn`)) {
                    copy += `COPY ./.yarn/releases ${workingDir}/.yarn/releases\n\n`;
                }
            } else {
                copy = 'COPY ["package.json", "yarn.lock*", "./"]\n\n';
            }
        } else {
            copy =
                'COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]\n\n';
        }

        let cmd;

        if (packageManager === 'yarn') {
            cmd = `CMD ["yarn", "run", "${script}"]`;
        } else {
            cmd = `CMD ["npm", "run", "${script}", "--update-notifier=false"]`;
        }

        let contents = `FROM ${nodeImage}\n\n`;

        contents += `WORKDIR ${workingDir}\n\n`;

        contents += `${copy}`;

        dir = multiRepo ? workingDir + '/' + dir : workingDir;

        if (packageManager === 'npm') {
            contents += `RUN --mount=type=cache,target=${dir}/node_modules --mount=type=cache,id=npm,target=~/.npm \\\n`;
        } else if (packageManager === 'yarn') {
            if (yarnVersion < 2) {
                contents += `RUN --mount=type=cache,target=${dir}/node_modules --mount=type=cache,id=npm,target=~/.cache/yarn/v6 \\\n`;
            } else {
                contents += `RUN --mount=type=cache,target=${dir}/.yarn/cache \\\n`;
            }
        }

        contents += `${install}`;

        if (nodeUser) {
            contents += 'COPY --chown=node:node . .\n\n';
            contents += 'USER node\n\n';
        } else {
            contents += 'COPY . .\n\n';
        }

        contents += `${cmd}`;

        const file = files.getFullFile(filename, cwd);

        fs.writeFileSync(file, contents);
        return file;
    }
}

module.exports = DockerFile;
