module.exports = async (action) => {
    const { program } = require('commander');
    program
        .command('info')
        .description(
            'Output project configuration\n\nDisplays project configuration associated with current directory when no options passed'
        )
        .option('-a --all', 'Output contents of config JSON file')
        .option('-s --select', 'Output configuration for selected project')
        .option('-d --default', 'Output default configuration')
        .option('-p --path', 'Output config file path')
        .action(action);
    await program.parseAsync(process.argv);
};
