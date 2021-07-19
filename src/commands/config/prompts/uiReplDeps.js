const fs = require('fs');
const { config } = require('../../../lib/config');
const ObjectPrompt = require('../../../lib/inquirer/object-prompt');

const inquire = () => {
    return (answers, setDefs, setAnswers, title) => {
        const projectConfig = config.getProjectConfig();

        const { services } = projectConfig;

        const choices = Object.keys(services).filter((name) => services[name].isNode);

        const objectPrompt = new ObjectPrompt({
            key: 'uiReplDeps',
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
                        name: 'uiReplDeps',
                        message: 'No package.json found for selected project',
                        choices: [{ value: null, name: 'Return' }],
                    };
                }

                const deps = Object.keys(pkg.dependencies || {});

                if (deps.length === 0) {
                    return {
                        type: 'inqselect',
                        name: 'uiReplDeps',
                        message: 'No dependencies found',
                        choices: [{ value: null, name: 'Return' }],
                    };
                }

                let uiReplDeps;

                if ((projectConfig.uiReplDeps[key] || []).length) {
                    uiReplDeps = projectConfig.uiReplDeps[key];
                } else {
                    uiReplDeps = deps;
                }

                let copy = [...uiReplDeps];

                for (const dep of uiReplDeps) {
                    if (!deps.includes(dep)) {
                        copy = copy.filter((d) => {
                            return d !== dep;
                        });
                    }
                }

                uiReplDeps = copy;

                return {
                    type: 'inqcheck',
                    name: 'uiReplDeps',
                    message: 'Load dependencies in DNV UI REPL session',
                    choices: deps,
                    default: uiReplDeps,
                };
            },
        });

        return objectPrompt.display(answers, setDefs, setAnswers);
    };
};

module.exports = inquire;
