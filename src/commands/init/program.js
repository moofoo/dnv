module.exports = async (action) => {
    const { program } = require('commander');
    program.command('init').description('Initialize project').action(action);
    await program.parseAsync(process.argv);
};
