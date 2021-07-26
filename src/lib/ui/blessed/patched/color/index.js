const blessed = require('blessed');
const memoize = require('lodash.memoize');
const nearestColor = require('./antsy-color');
let ansi256 = require('./ansi256.json');
const { Color } = require('./vscode');
const { AttributeData } = require('./xterm/attributedata');

blessed.colors.isXterm = (color, layer = 'fg') => {
    let isXterm;

    if (color === 0x1ff) {
        return false;
    }

    if (typeof color === 'number') {
        if (layer === 'fg' && (color <= 255 || ((color >> 9) & 0x1ff) <= 255)) {
            isXterm = false;
        } else if (layer === 'bg' && (color <= 255 || (color & 0x1ff) <= 255)) {
            isXterm = false;
        } else if (color > 255) {
            isXterm =
                layer === 'fg'
                    ? AttributeData.isFgPalette(color) ||
                      AttributeData.isFgRGB(color)
                    : AttributeData.isBgPalette(color);
        }
    } else {
        isXterm = false;
    }

    return isXterm;
};

const ansiHex = ansi256.reduce((acc, curr) => {
    return {
        ...acc,
        [curr.hex]: curr,
    };
}, {});

const xtermAnsi = {};

const checkColor = (color) => {
    if (color >= 0 && color <= 255) {
        return color;
    }

    if (ansiHex[color]) {
        return ansiHex[color].ansi;
    } else if (xtermAnsi[color]) {
        return xtermAnsi[color].ansi;
    }

    return null;
};

const badOrDefault = (color) => {
    if (
        color === -1 ||
        color === 0x1ff ||
        color === null ||
        color === undefined ||
        (color.trim && color.trim() === '')
    ) {
        return true;
    }

    return false;
};

blessed.colors.darken = memoize(
    (color, factor, layer) => {
        if (badOrDefault(color)) {
            if (layer === 'fg') {
                color = 7;
            } else {
                return 0;
            }
        }

        let rgb;
        const checked = checkColor(color);

        if (checked !== null) {
            rgb = ansi256[checked].rgb;
        } else if (typeof color === 'string' && color.charAt(0) === '#') {
            rgb = ansi256[nearestColor(blessed.colors.hexToRGB(color))].rgb;
        } else if (typeof color === 'number' && color > 255) {
            if (blessed.colors.isXterm(color, layer)) {
                rgb = AttributeData.toColorRGB(color);
            } else {
                const blessedNum =
                    layer === 'fg' ? (color >> 9) & 0x1ff : color & 0x1ff;

                if (blessedNum <= 255) {
                    rgb = ansi256[blessedNum].rgb;
                } else {
                    // The XTerm check isn't perfect, so if we end up here try the converstion to RGB
                    rgb = AttributeData.toColorRGB(color);
                }
            }
        } else if (Array.isArray(color)) {
            rgb = color;
        }

        if (!rgb) {
            return -1;
        }

        return nearestColor(...Color.fromArray(rgb).darken(factor).rgbArray);
    },
    (color, factor, layer, isXterm) =>
        `${
            color.toString ? color.toString() : color
        }${factor}${layer}${isXterm}`
);

blessed.colors.convert = memoize(
    (color, layer = 'fg') => {
        if (badOrDefault(color)) {
            return 0x1ff;
        }

        const cachedMaybe = checkColor(color);

        if (cachedMaybe !== null) {
            return cachedMaybe;
        }

        let isXterm = false;

        if (typeof color === 'number' && color > 255) {
            isXterm = blessed.colors.isXterm(color, layer);

            if (isXterm) {
                color = AttributeData.toColorRGB(color);
            } else {
                const blessedNum =
                    layer === 'fg' ? (color >> 9) & 0x1ff : color & 0x1ff;

                if (blessedNum <= 255) {
                    return blessedNum;
                } else {
                    color = AttributeData.toColorRGB(color);
                }
            }
        }

        if (typeof color === 'string') {
            color = color.replace(/[\- ]/g, '');
            if (blessed.colors.colorNames[color] != null) {
                color = blessed.colors.colorNames[color];
            } else {
                color = blessed.colors.match(
                    color,
                    null,
                    null,
                    layer,
                    isXterm,
                    false
                );
            }
        } else if (Array.isArray(color)) {
            color = blessed.colors.match(
                color[0],
                color[1],
                color[2],
                layer,
                isXterm,
                false
            );
        } else {
            color = blessed.colors.match(
                color,
                null,
                null,
                layer,
                isXterm,
                false
            );
        }

        return color !== -1 ? color : 0x1ff;
    },
    (color, layer, isXterm) =>
        `${color ? color.toString() : 'u'}${layer}${isXterm}`
);

blessed.colors.match = function (
    r1,
    g1,
    b1,
    layer = 'fg',
    isXterm,
    getRGB = false
) {
    if (badOrDefault(r1)) {
        if (layer === 'fg') {
            return getRGB ? ansi256[15].rgb : 15;
        } else {
            return getRGB ? ansi256[0].rgb : 0;
        }
    }

    if (!getRGB) {
        const cachedMaybe = checkColor(r1);

        if (cachedMaybe !== null) {
            return cachedMaybe;
        }
    }

    isXterm =
        isXterm !== undefined ? isXterm : blessed.colors.isXterm(color, layer);

    let hex;
    let xtermNum;

    if (typeof r1 === 'string') {
        hex = r1;

        if (hex[0] !== '#') {
            return -1;
        }

        [r1, g1, b1] = blessed.colors.hexToRGB(hex);
    } else if (Array.isArray(r1)) {
        (b1 = r1[2]), (g1 = r1[1]), (r1 = r1[0]);
    } else if (typeof color === 'number' && r1 > 255) {
        if (isXterm) {
            xtermNum = r1;
            [r1, g1, b1] = AttributeData.toColorRGB(r1);
        } else {
            const blessedNum = layer === 'fg' ? (r1 >> 9) & 0x1ff : r1 & 0x1ff;

            if (blessedNum <= 255) {
                return blessedNum;
            } else {
                xtermNum = r1;
                [r1, g1, b1] = AttributeData.toColorRGB(r1);
            }
        }
    }

    if (getRGB) {
        return [r1, g1, b1];
    }

    var hash = (r1 << 16) | (g1 << 8) | b1;

    if (blessed.colors._cache[hash] != null) {
        return blessed.colors._cache[hash];
    }

    const nearest = nearestColor(r1, g1, b1);

    blessed.colors._cache[hash] = nearest;

    if (hex && !ansiHex[hex]) {
        ansiHex[hex] = {
            ansi: nearest,
            hex,
            rgb: [r1, g1, b1],
        };
    }

    if (xtermNum && !xtermAnsi[xtermNum]) {
        xtermAnsi[xtermNum] = {
            ansi: nearest,
            rgb: [r1, g1, b1],
        };
    }

    return nearest;
};

blessed.colors.vcolors = ansi256.map((entry) => entry.hex);
blessed.colors.colors = ansi256.map((entry) => entry.rgb);

blessed.colors.reduce = function (color) {
    return color;
};

// Blend function from XTerm source
blessed.colors.blend = memoize(
    (fg = 15, bg = 0, alpha = 0.5) => {
        if (badOrDefault(fg)) {
            fg = 15;
        }

        if (badOrDefault(bg)) {
            bg = 0;
        }

        alpha = 1 - alpha;

        fg = fg >= 0 ? blessed.colors.convert(fg, 'fg') : 15;
        bg = bg >= 0 ? blessed.colors.convert(bg, 'bg') : 0;

        fg = fg === 0x1ff ? 15 : fg;
        bg = bg === 0x1ff ? 0 : bg;

        fg = ansi256[fg];
        bg = ansi256[bg];

        const a = alpha || (fg.rgba & 0xff) / 255;

        if (a === 1) {
            return fg.ansi;
        }

        const fgR = (fg.rgba >> 24) & 0xff;
        const fgG = (fg.rgba >> 16) & 0xff;
        const fgB = (fg.rgba >> 8) & 0xff;
        const bgR = (bg.rgba >> 24) & 0xff;
        const bgG = (bg.rgba >> 16) & 0xff;
        const bgB = (bg.rgba >> 8) & 0xff;

        const r = bgR + Math.round((fgR - bgR) * a);
        const g = bgG + Math.round((fgG - bgG) * a);
        const b = bgB + Math.round((fgB - bgB) * a);

        return nearestColor(r, g, b);
    },

    (fg, bg, alpha) => `${fg}${bg}${alpha}`
);
