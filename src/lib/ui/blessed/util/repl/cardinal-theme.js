/*
    Pretty close approximation of VSCode Dark+, with various tweaks.

    I kinda ran out of patience trying to get some colors to work right, so this needs to be cleaned up
*/

const chalk = require('chalk');
const processCardinal = require('./cardinal-chalk');

const nestingcolors = ['#F7DD2A', '#F167D7', '#92CAF9'];
let parenthDepth = -1;
let braceDepth = -1;
let bracketDepth = -1;

module.exports = processCardinal({
    Boolean: {
        true: chalk.hex('#17BE39'),
        false: chalk.hex('#E22428'),
        _default: undefined,
    },

    Identifier: {
        undefined: undefined,
        self: chalk.hex('#65BDF1'),
        console: chalk.hex('#7ACAFD'),
        log: chalk.hex('#E9F19E'),
        warn: chalk.hex('#E9F19E'),
        error: chalk.hex('#E9F19E'),
        _default: function (s, info) {
            if (
                info.tokens[info.tokenIndex + 1].value === ')' &&
                info.tokens[info.tokenIndex - 1].value === '('
            ) {
                return chalk.hex('#56bdff')(s);
            }

            if (
                info.tokens[info.tokenIndex + 1].value === ']' &&
                info.tokens[info.tokenIndex - 1].value === '['
            ) {
                return chalk.hex('#95ffa1')(s);
            }

            if (
                info.tokens[info.tokenIndex + 1].value === ':' &&
                info.tokens[info.tokenIndex - 1].value !== '['
            ) {
                return chalk.hex('#63b9d6')(s);
            }

            if (
                s === 'Function' &&
                info.tokens[info.tokenIndex + 1].value === ':' &&
                info.tokens[info.tokenIndex - 1].value === '['
            ) {
                return chalk.hex('#3BBE92')(s);
            }

            if (s === 'async') {
                return chalk.hex('#2879d0')(s);
            }

            if (s === 'await') {
                return chalk.hex('#DF7FD6')(s);
            }

            var nextToken = info.tokens[info.tokenIndex + 1].value;

            if (nextToken === '(') {
                return chalk.hex('#fff17d')(s);
            }

            return chalk.hex('#64beea')(s);
        },
    },

    Null: {
        _default: chalk.hex('#4F85D4'),
    },

    Numeric: {
        _default: chalk.hex('#a8daad'),
    },

    String: {
        _default: chalk.hex('#d27f6c'),
    },

    Keyword: {
        break: chalk.hex('#DF7FD6'),

        case: chalk.hex('#DF7FD6'),
        catch: chalk.hex('#DF7FD6'),
        class: chalk.hex('#2879d0'),
        const: chalk.hex('#2879d0'),
        continue: chalk.hex('#DF7FD6'),

        debugger: chalk.hex('#2879d0'),
        default: chalk.hex('#DF7FD6'),
        delete: chalk.hex('#2879d0'),
        do: chalk.hex('#DF7FD6'),

        else: chalk.hex('#DF7FD6'),
        enum: undefined,
        export: chalk.hex('#2879d0'),
        extends: chalk.hex('#2879d0'),

        finally: chalk.hex('#DF7FD6'),
        for: chalk.hex('#DF7FD6'),
        function: chalk.hex('#2879d0'),

        if: chalk.hex('#DF7FD6'),
        implements: undefined,
        import: undefined,
        in: undefined,
        instanceof: undefined,
        let: chalk.hex('#2879d0'),
        new: chalk.hex('#2879d0'),
        package: undefined,
        private: undefined,
        protected: undefined,
        public: undefined,
        return: chalk.hex('#DF7FD6'),
        static: undefined,
        super: undefined,
        switch: chalk.hex('#DF7FD6'),

        this: chalk.hex('#2879d0'),
        throw: undefined,
        try: chalk.hex('#DF7FD6'),
        typeof: undefined,

        var: chalk.hex('#2879d0'),
        void: undefined,

        while: chalk.hex('#DF7FD6'),
        with: undefined,
        yield: undefined,
        _default: function (s, info) {
            if (
                info.tokens[info.tokenIndex + 1].value === ')' &&
                info.tokens[info.tokenIndex - 1].value === '('
            ) {
                return chalk.hex('#56bdff')(s);
            }

            if (
                info.tokens[info.tokenIndex + 1].value === ']' &&
                info.tokens[info.tokenIndex - 1].value === '['
            ) {
                return chalk.hex('#95ffa1')(s);
            }

            if (s === 'await') {
                return chalk.hex('#DF7FD6')(s);
            }

            if (s === 'async') {
                return chalk.hex('#2879d0');
            }

            if (s === 'function') {
                return chalk.hex('#7BA4D5')(s);
            }

            var prevToken = info.tokens[info.tokenIndex - 1].value;

            if (prevToken === 'function') {
                return chalk.hex('#CEDFAC')(s);
            }

            var nextToken = info.tokens[info.tokenIndex + 1].value;

            if (nextToken === '(') {
                return chalk.hex('#fff17d')(s);
            }

            return chalk.hex('#DF7FD6')(s);
        },
    },

    Punctuator: {
        ';': chalk.hex('#e1e8e8'),
        '.': chalk.hex('#e1e8e8'),
        ',': chalk.hex('#e1e8e8'),

        '{': (s, info) => {
            braceDepth++;

            if (braceDepth > 2) {
                braceDepth = 0;
            }

            return chalk.hex(nestingcolors[braceDepth])(s);
        },
        '}': (s, info) => {
            s = chalk.hex(nestingcolors[braceDepth])(s);

            braceDepth--;

            if (braceDepth < 0) {
                braceDepth = 2;
            }

            return s;
        },

        '(': (s, info) => {
            parenthDepth++;

            if (parenthDepth > 2) {
                parenthDepth = 0;
            }

            return chalk.hex(nestingcolors[parenthDepth])(s);
        },
        ')': (s, info) => {
            s = chalk.hex(nestingcolors[parenthDepth])(s);

            parenthDepth--;

            if (parenthDepth < 0) {
                parenthDepth = 2;
            }

            return s;
        },

        '[': (s, info) => {
            bracketDepth++;

            if (bracketDepth > 2) {
                bracketDepth = 0;
            }

            return chalk.hex(nestingcolors[bracketDepth])(s);
        },
        ']': (s, info) => {
            s = chalk.hex(nestingcolors[bracketDepth])(s);

            bracketDepth--;

            if (bracketDepth < 0) {
                bracketDepth = 2;
            }

            return s;
        },

        '<': undefined,
        '>': undefined,
        '+': undefined,
        '-': undefined,
        '*': undefined,
        '%': undefined,
        '&': undefined,
        '|': undefined,
        '^': undefined,
        '!': undefined,
        '~': undefined,
        '?': undefined,
        ':': undefined,
        '=': undefined,

        '<=': undefined,
        '>=': undefined,
        '==': undefined,
        '!=': undefined,
        '++': undefined,
        '--': undefined,
        '<<': undefined,
        '>>': undefined,
        '&&': undefined,
        '||': undefined,
        '+=': undefined,
        '-=': undefined,
        '*=': undefined,
        '%=': undefined,
        '&=': undefined,
        '|=': undefined,
        '^=': undefined,
        '/=': undefined,
        '=>': undefined,
        '**': undefined,

        '===': undefined,
        '!==': undefined,
        '>>>': undefined,
        '<<=': undefined,
        '>>=': undefined,
        '...': undefined,
        '**=': undefined,

        '>>>=': undefined,

        _default: chalk.hex('#e1e8e8'),
    },

    // line comment
    Line: {
        _default: chalk.hex('#59B35E'),
    },

    /* block comment */
    Block: {
        _default: chalk.hex('#59B35E'),
    },

    // JSX
    JSXAttribute: {
        _default: chalk.magenta,
    },
    JSXClosingElement: {
        _default: chalk.magenta,
    },
    JSXElement: {
        _default: chalk.magenta,
    },
    JSXEmptyExpression: {
        _default: chalk.magenta,
    },
    JSXExpressionContainer: {
        _default: chalk.magenta,
    },
    JSXIdentifier: {
        className: chalk.blueBright,
        _default: chalk.magenta,
    },
    JSXMemberExpression: {
        _default: chalk.magenta,
    },
    JSXNamespacedName: {
        _default: chalk.magenta,
    },
    JSXOpeningElement: {
        _default: chalk.magenta,
    },
    JSXSpreadAttribute: {
        _default: chalk.magenta,
    },
    JSXText: {
        _default: chalk.greenBright,
    },

    _default: chalk.hex('#e1e8e8'),
});
