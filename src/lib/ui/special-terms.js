/*
   Special-case modifications of Terminal widget options.

   Just playing around with mouse input and nano at the moment

   If this ever expands to be more than just fiddling with a single program
   I'll make a plugin system or something
*/

const runningNano = (term, options = {}) => {
    if (!term || term.options.hideCursor) {
        return false;
    }

    if (
        term.options.termType === 'program' &&
        term.options.name === 'nano' &&
        term.options.command.includes('nano')
    ) {
        return 'program';
    }

    if (
        term.options.termType === 'shell' &&
        term.shellProgram &&
        term.lastCommand === 'nano'
    ) {
        return 'shell';
    }

    return false;
};

const nanoMouseArg = (term, options = {}) => {
    const isNano = runningNano(term, options);

    if (
        (isNano === 'shell' &&
            term.lastCommand === 'nano' &&
            term.lastArguments.includes('--mouse')) ||
        (isNano === 'program' && term.options.command.includes('--mouse'))
    ) {
        return true;
    }

    return false;
};

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
        if (options.termType === 'program' && options.name !== 'nano') {
            return options;
        }

        const lineState = {
            ...(options.lineState || {}),
            nanoExit: {
                noState: true,
                fn: (line, ls, term) => {
                    if (runningNano(term) === 'program') {
                        if (line.includes('to return to nano')) {
                            term.userClose = true;
                            term.persisting = false;
                            term.destroy();
                        }
                    }
                },
            },
        };

        const hideCursor =
            options.termType === 'shell' ||
            (options.termType === 'program' && options.name === 'nano')
                ? false
                : !!options.hideCursor;

        return {
            ...options,
            hideCursor,
            doMouseSelect: (term) => {
                if (!hideCursor && nanoMouseArg(term)) {
                    return false;
                }

                return true;
            },
            doAltClick: (term) => {
                if (!hideCursor && nanoMouseArg(term)) {
                    return true;
                }

                if (
                    term.options.shellType === 'repl' ||
                    term.onCommandLine ||
                    term.options.hideCursor === false
                ) {
                    return true;
                }

                return false;
            },
            doOnMouse: (term) => {
                if (!hideCursor && runningNano(term)) {
                    if (nanoMouseArg(term)) {
                        return true;
                    } else {
                        return false;
                    }
                }

                return term.shellProgram && term.writable;
            },
            lineState,
        };
    }

    return options;
};

module.exports = {
    specialTerminalOptions,
};
