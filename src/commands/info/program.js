module.exports = async (action) => {
    const { program } = require('commander');
    program
        .command('info')
        .description('Output project configuration')
        .option(
            '-a --all',
            'Output entire project config object, including internally used values'
        )
        .option('-d --default', 'Output default configuration')
        .option('-p --path', 'Output config file path')
        .action(action);
    await program.parseAsync(process.argv);
};
