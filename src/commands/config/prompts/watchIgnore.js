const { config } = require('../../../lib/config');
const SuperList = require('../../../lib/inquirer/superList');

const inquire = (project = false) => {
    return (answers, setDefs, setAnswers, title) => {
        const defaultConfig = config.get('defaultConfig');
        const projectConfig = project ? config.getProjectConfig() : null;

        let { watchIgnore } = answers.watchIgnore
            ? answers
            : projectConfig ||
              defaultConfig || {
                  watchIgnore: [
                      {
                          value: String.raw`/(^|[\/\\])\../`,
                          enabled: true,
                      },
                      {
                          value: '**/node_modules/**',
                          enabled: true,
                      },
                  ],
              };

        const userList = new SuperList({
            key: 'watchIgnore',
            title: 'Files/paths to be ignored when watching files (https://github.com/micromatch/anymatch)',
            sectionTitle: title,
            addMessage: 'Add pattern',
            addOrModifyMessage: 'Add or modify ignore pattern',
            editOrDeleteMessage: 'Edit or delete pattern',
            defaultsKey: 'watchIgnore',
            defaults: watchIgnore,
            alt: {
                [String.raw`/(^|[\/\\])\../`]: String.raw`/(^|[\/\\])\../` + ' (dot files)',
            },
        });
        return userList.display(answers, setDefs, setAnswers);
    };
};

module.exports = inquire;
