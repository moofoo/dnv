module.exports = async (action) => {
    if (process.argv.length > 3) {
        const { program } = require('commander');
        program
            .command('clear')
            .description(
                'Remove containers, volumes and config for DNV projects'
            )
            .option(
                '-p --project',
                'Remove Docker objects and configuration for current directory project'
            )
            .option(
                '-a --all',
                'Remove Docker objects and configuration for selected projects'
            )
            .option(
                '-d --docker',
                'Remove containers, volumes and images created by DNV for selected projects'
            )
            .option(
                '-r --reset',
                'Remove all DNV created Docker elements and clear configuration'
            )
            .option(
                '-f --force',
                'Used with --project, runs clear without showing options prompts'
            )
            .option(
                '--dependencies',
                'Delete npm / yarn / yarn v2 lock files and module folders in the current directory.'
            )
            .action(action);

        await program.parseAsync(process.argv);
    } else {
        console.log(
            String.raw`
Usage: dnv clear [options]

Remove containers, volumes and config for DNV projects

Options:
  -p --project  Remove Docker objects and configuration for current directory project
  -a --all      Remove Docker objects and configuration for selected projects
  -d --docker   Remove containers, volumes and images created by DNV for selected projects
  -r --reset    Remove all DNV created Docker elements and clear configuration
  -f --force    bypass prompts
  -n --name     Remove docker elements by name. This just does simple pattern matching so BE CAREFUL
  -h, --help    display help for command

`
        );
    }
};
