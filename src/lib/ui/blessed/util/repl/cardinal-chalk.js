/*
    We need to use the the ._styler property on chalk chained methods to get a before:after string to use, instead
    of the methods themselves, since cardinal (or redeyed) passes two arguments to functions used in the theme config (token string and token info)
    This messes up chalk (it sees the second arg, tries to do a nested style, and fails)

    Pretty happy I figured out why chalk functions weren't working with cardinal. Cardinal has the most options up front
    for highlighting javascript (kind of an odd particular selection though), but it only seemed to work with the ansicolor lib
    (which only gives you 16 colors).
*/

const processCardinal = (obj) => {
    for (let [key, val] of Object.entries(obj)) {
        if (typeof val === 'function' && val._styler) {
            obj[key] = `${val._styler.openAll}:${val._styler.closeAll}`;
        } else if (typeof val === 'object') {
            val = processCardinal(val);
        }
    }

    return obj;
};

module.exports = processCardinal;
