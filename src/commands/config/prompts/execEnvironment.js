const { config } = require('../../../lib/config');
const SuperList = require('../../../lib/inquirer/superList');

const execEnvironment = (project = false) => {
    return (answers, setDefs, setAnswers, title) => {
        const defaultConfig = config.get('defaultConfig');
        const projectConfig = project ? config.getProjectConfig() : null;

        let { execEnvironment } = answers.execEnvironment
            ? answers
            : projectConfig ||
              defaultConfig || {
                  execEnvironment: [
                      {
                          value: 'TERM=xterm-256color',
                          enabled: true,
                      },
                      {
                          value: 'LC_ALL=C.UTF-8',
                          enabled: true,
                      },
                      {
                          value: 'LANG=C.UTF-8',
                          enabled: true,
                      },
                  ],
              };

        const userList = new SuperList({
            key: 'execEnvironment',
            title: 'Set environment variables used with docker exec',
            sectionTitle: title,
            addMessage: 'Add variable',
            addOrModifyMessage: 'Add or modify variable',
            editOrDeleteMessage: 'Edit or delete variable',
            defaultsKey: 'execEnvironment',
            defaults: execEnvironment,
        });

        return userList.display(answers, setDefs, setAnswers);
    };
};

module.exports = execEnvironment;
