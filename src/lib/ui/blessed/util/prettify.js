const chalk = require('chalk');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const stripAnsi = require('strip-ansi');
const { Format } = require('../patched/color/vscode');
const nearestColor = require('../patched/color/antsy-color');
const ansi256 = require('../patched/color/ansi256.json');

dayjs.extend(customParseFormat);

const colors = [
    '#00ffff',
    '#00ff00',
    '#ffff00',
    '#ff0000',
    '#00afff',
    '#d7af00',
    '#87ffaf',
    '#00ff87',
    '#5fd7ff',
    '#afff5f',
    '#8787ff',
    '#ff0087',
    '#ff5f00',
    '#af5faf',
    '#00ff00',
    '#00ffff',
    '#00cd00',
    '#00cdcd',
    '#5c5cff',
];

const map = colors.map((hex) => {
    let col = Format.parseHex(hex, true);

    col = col.darken(0.45);

    const ansi = nearestColor(col.rgba.r, col.rgba.g, col.rgba.b);

    return {
        hex,
        color: chalk.hex(hex),
        alt: chalk.ansi256(ansi),
    };
});

const storedColor = (() => {
    const colorMap = [...map];

    let lastHex = '';

    let remainingColors = [...map];

    const match = {};

    return (txt, id, bright = false) => {
        if (match[id]) {
            if (Array.isArray(txt)) {
                return match[id](txt[0]) + match[id].alt(txt[1]);
            }

            return match[id](txt);
        }

        if (remainingColors.length === 0) {
            remainingColors = colorMap;
        }

        let obj =
            remainingColors[Math.floor(Math.random() * remainingColors.length)];

        if (obj.hex === lastHex) {
            obj =
                remainingColors[
                    Math.floor(Math.random() * remainingColors.length)
                ];
        }

        remainingColors = remainingColors.filter((col) => {
            return col.hex !== obj.hex;
        });

        match[id] = obj.color;

        match[id].color = obj.hex;

        match[id].alt = obj.alt;

        lastHex = obj.hex;

        if (Array.isArray(txt)) {
            return match[id](txt[0]) + match[id].alt(txt[1]);
        }
        if (txt === null) {
            return match[id];
        }

        return match[id](txt);
    };
})();

const prettify = (key, output) => {
    output = output
        .split('\n')
        .map((line) => {
            let split;
            let init = null;

            if (
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/.test(
                    stripAnsi(line).trim()
                )
            ) {
                init = true;
                split = line.split(' ');
            } else if (
                /^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} \| /.test(
                    stripAnsi(line).trimLeft()
                )
            ) {
                split = line.split(' | ');
                init = false;
            }

            if (init !== null) {
                let log = split.slice(1).join(' ');
                let timestamp = split[0].trim();

                let stored;

                if (init) {
                    timestamp = timestamp.split('.')[0].replace('T', ' ');

                    const formatted = dayjs(
                        timestamp,
                        'YYYY-MM-DD HH:mm:ss'
                    ).format('MM/DD/YY HH:mm:ss');

                    stored = storedColor(
                        [`${formatted} `, '|'],
                        key +
                            dayjs(timestamp, 'YYYY-MM-DD HH:mm:ss').format(
                                'MM/DD/YY'
                            )
                    );

                    line = stored + ' ' + log;
                } else if (!init) {
                    stored = storedColor(
                        [`${timestamp} `, '|'],
                        key +
                            dayjs(timestamp, 'MM/DD/YY HH:mm:ss').format(
                                'MM/DD/YY'
                            )
                    );

                    line = stored + ' ' + log;
                }
            }

            return line;
        })
        .join('\n');

    return output;
};

const chalkSubStr = (chalkWhole, chalkPart, str, substr, glbl = false) => {
    str = chalkWhole(str);
    const chalkedSub = chalkPart(substr);

    if (glbl) {
        str = str.replace(RegExp(substr, 'g'), chalkedSub);
    } else {
        str = chalkWhole(str.replace(substr, chalkedSub));
    }

    return str;
};

module.exports = {
    color: storedColor,
    prettify,
    chalkSubStr,
};
