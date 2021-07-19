const fs = require('fs');
const { config } = require('../../../lib/config');
const ObjectPrompt = require('../../../lib/inquirer/object-prompt');

const inquire = () => {
    return (answers, setDefs, setAnswers, title) => {
        const projectConfig = config.getProjectConfig();

        const { services } = projectConfig;

        const choices = Object.keys(services).filter((name) => services[name].isNode);

        const objectPrompt = new ObjectPrompt({
            key: 'uiReplDevDeps',
            sectionTitle: title,
            chooseKeyPrompt: {
                type: 'inqselect',
                name: 'objectKey',
                choices,
                message: 'Select Node Service',
            },
            promptScreenPrompt: (key) => {
                const data = services[key];

                const pkg = JSON.parse(fs.readFileSync(data.managerFiles.pkg.host, 'utf-8'));

                if (!pkg) {
                    return {
                        type: 'inqselect',
                        name: 'uiReplDevDeps',
                        message: 'No package.json found for selected project',
                        choices: [{ value: null, name: 'Return' }],
                    };
                }

                const deps = Object.keys(pkg.devDependencies || {});

                if (deps.length === 0) {
                    return {
                        type: 'inqselect',
                        name: 'uiReplDevDeps',
                        message: 'No dependencies found',
                        choices: [{ value: null, name: 'Return' }],
                    };
                }

                let uiReplDevDeps;

                if ((projectConfig.uiReplDevDeps[key] || []).length) {
                    uiReplDevDeps = projectConfig.uiReplDevDeps[key];
                } else {
                    uiReplDevDeps = deps;
                }

                let copy = [...uiReplDevDeps];

                for (const dep of uiReplDevDeps) {
                    if (!deps.includes(dep)) {
                        copy = copy.filter((d) => {
                            return d !== dep;
                        });
                    }
                }

                uiReplDevDeps = copy;

                return {
                    type: 'inqcheck',
                    name: 'uiReplDevDeps',
                    message: 'Load development dependencies in REPL session',
                    choices: deps,
                    default: uiReplDevDeps,
                };
            },
        });

        return objectPrompt.display(answers, setDefs, setAnswers);
    };
};

module.exports = inquire;
