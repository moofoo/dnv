const inquirer = require('inquirer');
const { config } = require('../../../lib/config');
const SuperList = require('../../../lib/inquirer/superList');

const inquire = () => {
    return async (answers, setDefs, setAnswers, title) => {

        const projectConfig = config.getProjectConfig();

        let { installGlobals } = Object.keys(answers.installGlobals || {}).length
            ? answers
            : Object.keys(projectConfig.installGlobals || {}).length ? projectConfig : { installGlobals: {} }

        const userList = new SuperList({
            key: 'installGlobals',
            title: 'Install global dependencies in Node service container',
            sectionTitle: title,
            addMessage: 'Add Global Install',
            addOrModifyMessage: 'Add or modify global install',
            editOrDeleteMessage: 'Edit or delete global install',
            defaultsKey: 'installGlobals',
            defaults: installGlobals,
            selectService: true,
            services: Object.keys(projectConfig.services).filter((name) => projectConfig.services[name].isNode)
        });

        return userList.display(answers, setDefs, setAnswers);
    };
};

module.exports = inquire;
