const { config } = require('../../../lib/config');

const SuperList = require('../../../lib/inquirer/superList');

const inquire = (project = false) => {
    return (answers, setDefs, setAnswers, title) => {
        const defaultConfig = config.get('defaultConfig');
        const projectConfig = project ? config.getProjectConfig() : null;

        let { forceInstall } = answers.forceInstall
            ? answers
            : projectConfig ||
              defaultConfig || {
                  forceInstall: [
                      {
                          value: 'node-gyp',
                          enabled: true,
                      },
                  ],
              };

        const userList = new SuperList({
            key: 'forceInstall',
            title: 'Force install the specified dependencies',
            sectionTitle: title,
            addMessage: 'Add dependency',
            addOrModifyMessage: 'Add or modify dependency',
            editOrDeleteMessage: 'Edit or delete dependency',
            defaultsKey: 'forceInstall',
            defaults: forceInstall,
            disable: ['node-gyp'],
        });

        return userList.display(answers, setDefs, setAnswers);
    };
};

module.exports = inquire;
