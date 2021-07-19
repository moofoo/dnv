module.exports = async (action) => {
    const { program } = require('commander');
    program
        .command('ui')
        .description('Run project with DNVs Multiplexing UI')
        .option('-i --install', 'Force run install in container')
        .option(
            '--nosync',
            'Do not synchronize docker-compose.yml and docker-compose-dnv.gen.yml'
        )
        .option(
            '--since <since>',
            'Load container logs from this time forward. Can be a duration string (i.e. 1h30m)'
        )
        .option(
            '--scrollback <scrollback>',
            'The amount of scrollback for logs in DNV UI'
        )
        .option(
            '--service <service...>',
            'Specify services to display in DNV UI'
        )
        .option(
            '-f --file <filename...>',
            'Specify additional .yml files to be merged with generated DNV file'
        )
        .option(
            '-q --quit',
            'Go through the startup process, but quit before running docker-compose up (or attaching to running containers).\n This will update project configuration based on changes to Docker files, as well as re-generate docker-compose-dnv-gen.yml'
        )
        .action(action);
    await program.parseAsync(process.argv);
};
