const configKeys = [
    'composeNodeImage',
    'dockerfileNodeImage',
    'execEnvironment',
    'forceInstall',
    'packageManager',
    'removeOrphans',
    'uiScrollback',
    'uiServices',
    'uiSince',
    'uiStats',
    'uiReplDeps',
    'uiReplDevDeps',
    'watchFiles',
    'watchIgnore',
    'workingdir',
];

const pickAnswers = (answers) => {
    return Object.keys(answers).reduce((acc, curr) => {
        if (!configKeys.includes(curr)) {
            return acc;
        }

        if (answers[curr] === undefined) {
            return acc;
        }

        return {
            ...acc,
            [curr]: answers[curr],
        };
    }, {});
};

module.exports = {
    configKeys,
    pickAnswers,
};
