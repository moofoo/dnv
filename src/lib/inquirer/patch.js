const inquirer = require('inquirer');

require('./manager');
inquirer.registerPrompt('inqconfirm', require('./confirm'));
inquirer.registerPrompt('inqinput', require('./input'));
inquirer.registerPrompt('inqselect', require('./select'));
inquirer.registerPrompt('inqcheck', require('./check'));

module.exports = inquirer;
