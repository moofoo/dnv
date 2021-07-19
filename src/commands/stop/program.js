module.exports = async (action) => {
    const { program } = require('commander');
    program
        .command('stop')
        .description('Run docker-compose stop for current project')
        .action(action);
    await program.parseAsync(process.argv);
};
