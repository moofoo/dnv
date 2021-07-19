/*
    from:
        https://github.com/xtermjs/xterm.js/blob/376b29673ba174934b1b6339ef3eed8449fec529/src/browser/Color.ts
        https://github.com/xtermjs/xterm.js/blob/376b29673ba174934b1b6339ef3eed8449fec529/src/browser/ColorManager.ts
*/

const { Color, RGBA } = require('../vscode');
const nearestColor = require('../antsy-color');
const hexRgb = require('hex-rgb');
const rgbHex = require('rgb-hex');
const { AttributeData } = require('./attributedata');
const memoize = require('lodash.memoize');
const blessed = require('blessed');

const Attributes = {
    /**
     * bit 1..8     blue in RGB, color in P256 and P16
     */
    BLUE_MASK: 0xff,
    BLUE_SHIFT: 0,
    PCOLOR_MASK: 0xff,
    PCOLOR_SHIFT: 0,

    /**
     * bit 9..16    green in RGB
     */
    GREEN_MASK: 0xff00,
    GREEN_SHIFT: 8,

    /**
     * bit 17..24   red in RGB
     */
    RED_MASK: 0xff0000,
    RED_SHIFT: 16,

    /**
     * bit 25..26   color mode: DEFAULT (0) | P16 (1) | P256 (2) | RGB (3)
     */
    CM_MASK: 0x3000000,
    CM_DEFAULT: 0,
    CM_P16: 0x1000000,
    CM_P256: 0x2000000,
    CM_RGB: 0x3000000,

    /**
     * bit 1..24  RGB room
     */
    RGB_MASK: 0xffffff,
};

function toColorRGB(value) {
    return [
        (value >>> Attributes.RED_SHIFT) & 255,
        (value >>> Attributes.GREEN_SHIFT) & 255,
        value & 255,
    ];
}

function fromColorRGB(value) {
    return (
        ((value[0] & 255) << Attributes.RED_SHIFT) |
        ((value[1] & 255) << Attributes.GREEN_SHIFT) |
        (value[2] & 255)
    );
}

function blessedToAnsi(blssd) {
    return (blssd >> 9) & 0x1ff;
}

function ansiToBlessed(ansi) {
    return ansi << 9;
}

function ansiToXterm(ansi) {
    return AttributeData.fromColorRGB(ansi256[ansi].rgb);
}
let ansi256 = [];
let entryByHex = {};
let nearestByHex = {};

function rgbToHex(r, g, b, a) {
    if (Array.isArray(r)) {
        [r, g, b, a] = r;
    }

    return '#' + rgbHex(r, g, b, !!a && a < 1 ? a : undefined);
}

function getNearest(r, g, b, a) {
    if (Array.isArray(r)) {
        [r, g, b] = r;
    } else if (typeof r === 'string' && r.charAt(0) === '#') {
        hex = r;
        [r, g, b] = hexRgb(r, { format: 'array' });
    }

    const hex = rgbToHex(r, g, b, 1);

    if (entryByHex[hex] !== undefined) {
        return entryByHex[hex].ansi;
    }

    if (nearestByHex[hex]) {
        return nearestByHex[hex];
    }

    const ansi = nearestColor(r, g, b);

    nearestByHex[hex] = ansi;

    return ansi;
}

function rgbToRGBA(r, g, b, a = 0xff) {
    if (Array.isArray(r)) {
        [r, g, b, a] = r;
    }

    return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

const entryFromHex = (hex, ansi = null) => {
    hex = hex.toLowerCase();

    if (entryByHex[hex]) {
        return entryByHex;
    }

    if (ansi256[nearestByHex[hex]]) {
        return ansi256[nearestByHex[hex]];
    }

    const rgb = hexRgb(hex, { format: 'array' });
    const darkened = getDarkened(rgb);

    if (ansi) {
        nearestByHex[hex] = ansi;
    } else {
        ansi = getNearest(rgb);
    }

    return {
        hex,
        rgba: rgbToRGBA(...rgb),
        rgb,
        ansi,
        blessed: ansiToBlessed(ansi),
        xterm: AttributeData.fromColorRGB(rgb),
        ...darkened,
    };
};

function entryFromRGB(r, g, b, a = 1, ansi = null) {
    if (Array.isArray(r)) {
        [r, g, b, a = 1] = r;
    }

    const hex = rgbToHex(r, g, b, 1);

    const rgb = [r, g, b, a];

    const darkened = getDarkened(rgb);

    ansi = getNearest(r, g, b, 1);

    return {
        hex,
        rgba: rgbToRGBA(...rgb),
        rgb,
        ansi,
        blessed: ansiToBlessed(ansi),
        xterm: AttributeData.fromColorRGB(rgb),
        ...darkened,
    };
}

const getDarkened = (rgb) => {
    if (typeof rgb === 'string' && rgb.charAt(0) === '#') {
        rgb = hexRgb(rgb, { format: 'array' });
    }

    a = 1;

    const defaults = {
        0.25: Color.fromArray(rgb).darken(0.25).rgbArray,
        0.5: Color.fromArray(rgb).darken(0.5).rgbArray,
        0.75: Color.fromArray(rgb).darken(0.75).rgbArray,
    };

    /*  const darkened = {
        /*dark1: new Color(...rgb).darken(10),
        dark2: new Color(...rgb).darken(20),
        dark3: new Color(...rgb).darken(30),
        dark4: new Color(...rgb).darken(40),
        dark5: new Color(...rgb).darken(50),
        dark6: new Color(...rgb).darken(60),
        dark7: new Color(...rgb).darken(70),
        dark8: new Color(...rgb).darken(80),
        dark9: new Color(...rgb).darken(90),
        dark1: new Color(rgb).darken(25).rgbArray,
        dark2: new Color(rgb).darken(50).rgbArray,
        dark3: new Color(rgb).darken(75).rgbArray,
    };*/

    return {
        darkened: Object.keys(defaults).reduce((acc, curr) => {
            const hex = rgbToHex(defaults[curr]);

            return {
                ...acc,
                [curr]: entryByHex[hex] ||
                    ansi256[nearestByHex[hex]] || {
                        hex,
                        ansi: getNearest(defaults[curr]),
                    },
            };
        }, {}),
    };
};

const getEntry = function (value, layer = 'fg', darken = false) {
    let entry;

    if (
        value === -1 ||
        value === 0x1ff ||
        value === undefined ||
        value === null ||
        value === ''
    ) {
        if (layer === 'fg') {
            entry = ansi256[15];
        } else {
            entry = ansi256[0];
        }
    }

    if (!entry && entryByHex[value]) {
        entry = entryByHex[value];
    }

    if (!entry && !darken) {
        if (!entry && ansi256[value]) {
            entry = ansi256[value];
        }

        if (!entry && blessed.colors.colorNames[value] != null) {
            entry = ansi256[blessed.colors.colorNames[value]];
        }
    }

    if (!entry) {
        let isBlessed = false;
        let isXterm = false;

        let blessedNum;
        let xtermRGB;
        /*
        if (typeof value === 'number' && value > 255) {
            blessedNum = layer === 'fg' ? (value >> 9) & 0x1ff : value & 0x1ff;
            if (blessedNum <= 255) {
                isBlessed = true;
            }

            if (!isBlessed) {
                xtermRGB = AttributeData.toColorRGB(value);
                for (const val of xtermRGB) {
                    if (val < 0 || val > 256) {
                        isXterm = false;
                        break;
                    }
                }
            }
        }
*/
        if (Array.isArray(value)) {
            entry = entryFromRGB(value);
        } else if (typeof value === 'string' && value.charAt(0) === '#') {
            entry = entryFromHex(value);
        } else if (typeof value === 'number' && value > 255) {
            const xtermRGB = AttributeData.toColorRGB(value);
            if (
                xtermRGB[0] < 0 ||
                xtermRGB[0] > 255 ||
                xtermRGB[1] < 0 ||
                xtermRGB[1] > 255 ||
                xtermRGB[2] < 0 ||
                xtermRGB[2] > 255
            ) {
                entry = ansi256[value >> 9];
            } else {
                entry = entryFromRGB(xtermRGB);
            }
        }
    }

    if (!entry) {
        if (layer === 'fg') {
            entry = ansi256[15];
        } else {
            entry = ansi256[0];
        }
    }

    if (darken > 0) {
        entry = darkenColor(entry, darken, layer);
    }

    entryByHex[entry.hex] = entry;

    return entry;
};

function getColorData(fg, bg, darken = false, alpha = false) {
    return {
        fg: getEntry(fg, 'fg', darken),
        bg: getEntry(bg, 'bg', darken),
    };
}

function darkenColor(value, factor = false, layer = 'fg', ansi = false) {
    let entry = value.ansi ? value : getEntry(value, layer);

    let dark;

    if (factor !== false && typeof factor === 'number') {
        if (entry.darkened[String(factor)]) {
            dark = entry.darkened[String(factor)];
        } else {
            const darkened = Color.fromArray(entry.rgb).darken(factor).rgbArray;

            const hex = rgbToHex(darkened[0], darkened[1], darkened[2], 1);

            dark = entryByHex[hex] ||
                ansi256[nearestByHex[hex]] || {
                    hex,
                    ansi: getNearest(darkened),
                };

            entry.darkened[String(factor)] = dark;
        }

        entry = { ...entry, darken: dark };
    }

    if (ansi) {
        if (factor && entry.darken) {
            return entry.darken.ansi;
        } else {
            return entry.ansi;
        }
    }

    return entry;
}

function blend(bg, fg, a = 0.5) {
    a = a || (fg.rgba & 0xff) / 255;
    if (a === 1) {
        return getColorData(fg, bg, false);
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
    const css = rgbToHex(r, g, b, 1);

    let data;
    if (entryByHex[css]) {
        data = entryByHex[css];
    } else if (ansi256[nearestByHex[css]]) {
        data = ansi256[nearestByHex[css]];
    } else {
        data = getColorData(css, bg, false);
    }

    return data;
}

ansi256 = Object.freeze(
    (() => {
        const colors = [
            // dark:
            entryFromHex('#000000', 0),
            entryFromHex('#cc0000', 1),
            entryFromHex('#4e9a06', 2),
            entryFromHex('#c4a000', 3),
            entryFromHex('#3465a4', 4),
            entryFromHex('#75507b', 5),
            entryFromHex('#008080', 6),
            entryFromHex('#c0c0c0', 7),
            // bright:
            entryFromHex('#555753', 8),
            entryFromHex('#ef2929', 9),
            entryFromHex('#8ae234', 10),
            entryFromHex('#fce94f', 11),
            entryFromHex('#729fcf', 12),
            entryFromHex('#ad7fa8', 13),
            entryFromHex('#34e2e2', 14),
            entryFromHex('#ffffff', 15),
        ];

        // Fill in the remaining 240 ANSI colors.
        // Generate colors (16-231)
        const v = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
        for (let i = 0; i < 216; i++) {
            const r = v[(i / 36) % 6 | 0];
            const g = v[(i / 6) % 6 | 0];
            const b = v[i % 6];
            colors.push(entryFromRGB(r, g, b, 1, i + 16));
        }

        // Generate greys (232-255)
        for (let i = 0; i < 24; i++) {
            const c = 8 + i * 10;
            colors.push(entryFromRGB(c, c, c, 1, i + 232));
        }

        return colors;
    })()
);

entryByHex = ansi256.reduce((acc, curr) => {
    return {
        ...acc,
        [curr.hex]: curr,
    };
}, {});

module.exports = {
    getEntry,
    getColorData,
    blend,
    darkenColor,
    ansi256,
};
