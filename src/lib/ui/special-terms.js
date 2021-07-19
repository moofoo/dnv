const specialTerminalOptions = (options = {}, debug) => {
    if (!options) {
        return options;
    }

    if (!options.termType) {
        return options;
    }

    if (
        ['shell', 'program'].includes(options.termType) &&
        !['script', 'repl'].includes(options.shellType)
    ) {
        const lineState = {
            ...(options.lineState || {}),
            nanoExit: {
                noState: true,
                fn: (line, ls, term) => {
                    if (
                        term.options.termType === 'program' &&
                        term.options.name === 'nano'
                    ) {
                        if (line.includes('to return to nano')) {
                            term.userClose = true;
                            term.persisting = false;
                            term.destroy();
                        }
                    }
                },
            },
        };

        return {
            ...options,
            doOnMouse: (term) => {
                return !(
                    term.shellProgram &&
                    (term.options.command.includes('nano') ||
                        term.lastCommand.includes('nano'))
                );
            },
            lineState,
        };
    }

    return options;
};

module.exports = {
    specialTerminalOptions,
};
