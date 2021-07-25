module.exports = async (action) => {
    const { program } = require('commander');
    program
        .command('config')
        .description(
            'Set project configuration\n\nOpens project configuration associated with current directory when no options passed'
        )
        .option('-s --select', 'Open configuration for selected project')
        .option('-d --default', 'Open Default configuration')
        .action(action);
    await program.parseAsync(process.argv);
};
