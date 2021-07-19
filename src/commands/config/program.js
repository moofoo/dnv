module.exports = async (action) => {
    const { program } = require('commander');
    program
        .command('config')
        .description('Set project configuration')
        .option('-d --default', 'Set Default Configuration')
        .option('-a --all', 'Show all projects')
        .action(action);
    await program.parseAsync(process.argv);
};
