//From: https://github.com/astefanutti/kubebox/blob/master/lib/ui/blessed/element.js
// Plus other changes

const blessed = require('blessed');
const nextTick = global.setImmediate || process.nextTick.bind(process);
const sgr = require('./sgr');
const memoize = require('lodash.memoize');
const debounce = require('lodash.debounce');
const boxStyles = require('./borders');

// work-around for https://github.com/chjj/blessed/issues/175
// Kubebox patch
blessed.element.prototype._getShrinkContent = function (xi, xl, yi, yl) {
    // PATCH BEGIN
    if (this._clines == null) {
        var h = 1;
        var w = 1;
    } else {
        var h = this._clines.length;
        var w = this._clines.mwidth || 1;
    }
    // PATCH END

    if (
        this.position.width == null &&
        (this.position.left == null || this.position.right == null)
    ) {
        if (this.position.left == null && this.position.right != null) {
            xi = xl - w - this.iwidth;
        } else {
            xl = xi + w + this.iwidth;
        }
    }

    if (
        this.position.height == null &&
        (this.position.top == null || this.position.bottom == null) &&
        (!this.scrollable || this._isList)
    ) {
        if (this.position.top == null && this.position.bottom != null) {
            yi = yl - h - this.iheight;
        } else {
            yl = yi + h + this.iheight;
        }
    }

    return { xi: xi, xl: xl, yi: yi, yl: yl };
};

// Kubebox patch
blessed.Element.prototype._parseAttr = function (lines) {
    var dattr = this.sattr(this.style),
        attr = dattr,
        attrs = [],
        line,
        i,
        j,
        c;

    // PATCH BEGIN
    // See: https://github.com/chjj/blessed/pull/306/
    if (
        Array.isArray(lines.attr) &&
        lines.attr.length > 0 &&
        lines.attr[0] === attr
    ) {
        return;
    }
    // PATCH END

    for (j = 0; j < lines.length; j++) {
        line = lines[j];
        attrs[j] = attr;
        for (i = 0; i < line.length; i++) {
            if (line[i] === '\x1b') {
                if ((c = /^\x1b\[[\d;]*m/.exec(line.substring(i)))) {
                    attr = this.screen.attrCode(c[0], attr, dattr);
                    i += c[0].length - 1;
                }
            }
        }
    }

    return attrs;
};

// Kubebox patch
blessed.Element.prototype.setLine = function (i, line) {
    if (typeof line === 'string') line = line.split('\n');

    i = Math.max(i, 0);
    while (this._clines.fake.length < i) {
        this._clines.fake.push('');
    }
    for (var j = 0; j < line.length; j++) {
        this._clines.fake[i + j] = line[j];
    }

    return this.setContent(this._clines.fake.join('\n'), true);
};

// Kubebox patch. Added 'style' argument
blessed.Element.prototype.setLabel = function (options, style) {
    var self = this;
    var Box = blessed.box;

    if (typeof options === 'string') {
        options = { text: options };
    }

    if (this._label) {
        this._label.setContent(options.text);
        if (style) {
            this._label.style = style;
        }
        if (options.side !== 'right') {
            this._label.rleft = 2 + (this.border ? -1 : 0);
            this._label.position.right = undefined;
            if (!this.screen.autoPadding) {
                this._label.rleft = 2;
            }
        } else {
            this._label.rright = 2 + (this.border ? -1 : 0);
            this._label.position.left = undefined;
            if (!this.screen.autoPadding) {
                this._label.rright = 2;
            }
        }
        return false;
    }

    this._label = new Box({
        screen: this.screen,
        parent: this,
        content: options.text,
        top: -this.itop,
        // PATCH BEGIN
        tags: true,
        // PATCH END
        shrink: true,
        style: style || this.style.label,
    });

    if (options.side !== 'right') {
        this._label.rleft = 2 - this.ileft;
    } else {
        this._label.rright = 2 - this.iright;
    }

    this._label._isLabel = true;

    if (!this.screen.autoPadding) {
        if (options.side !== 'right') {
            this._label.rleft = 2;
        } else {
            this._label.rright = 2;
        }
        this._label.rtop = 0;
    }

    var reposition = function () {
        if (self._label) {
            self._label.rtop = (self.childBase || 0) - self.itop;
            if (!self.screen.autoPadding) {
                self._label.rtop = self.childBase || 0;
            }
        }
        // PATCH BEGIN
        // if (!self._label.detached) self.screen.render();
        // PATCH END
    };

    this._labelScroll = function () {
        reposition();
    };

    this.on('scroll', this._labelScroll);

    this._labelResize = function () {
        nextTick(function () {
            reposition();
        });
    };

    this.on('resize', this._labelResize);

    this._label.on('destroy', () => {
        this.removeListener('scroll', this._labelScroll);
        this.removeListener('resize', this._labelResize);
    });

    return true;
};

blessed.Element.prototype.sattr = function (style, fg, bg) {
    var bold = style.bold,
        underline = style.underline,
        blink = style.blink,
        inverse = style.inverse,
        invisible = style.invisible,
        italics = style.italics,
        darken = style.darken;

    if (fg == null && bg == null) {
        fg = style.fg;
        bg = style.bg;
    }

    if (this.border) {
        for (const [name, value] of Object.entries(this.border)) {
            if (typeof value === 'function') {
                this.border[name] = value(this);
            }
        }
    }

    if (typeof italics === 'function') italics = italics(this);
    if (typeof bold === 'function') bold = bold(this);
    if (typeof underline === 'function') underline = underline(this);
    if (typeof blink === 'function') blink = blink(this);
    if (typeof inverse === 'function') inverse = inverse(this);
    if (typeof invisible === 'function') invisible = invisible(this);

    if (typeof fg === 'function') fg = fg(this);
    if (typeof bg === 'function') bg = bg(this);

    bg = blessed.colors.convert(bg, 'bg');

    if (darken > 0 && bg > 0) {
        bg = blessed.colors.darken(bg, darken, 'bg');
    }

    if (darken > 0) {
        fg = blessed.colors.darken(fg, darken, 'fg');
    } else {
        fg = blessed.colors.convert(fg, 'fg');
    }

    return (
        ((italics ? sgr.italics.flag : 0) << 18) |
        ((invisible ? sgr.invisible.flag : 0) << 18) |
        ((inverse ? sgr.inverse.flag : 0) << 18) |
        ((blink ? sgr.blink.flag : 0) << 18) |
        ((underline ? sgr.underline.flag : 0) << 18) |
        ((bold ? sgr.bold.flag : 0) << 18) |
        (fg << 9) |
        bg
    );
};

/*
    Only thing is a 'noBorder' flag to toggle rendering of element borders without needing to touch the element style
    Also changed how shadows are rendered
*/
blessed.Element.prototype.render = function (renderContent = true) {
    renderContent = this.options.renderContent || renderContent;

    this._emit('prerender');

    if (renderContent) {
        this.parseContent();
    }

    var coords = this._getCoords(true);
    if (!coords) {
        delete this.lpos;
        return;
    }

    if (coords.xl - coords.xi <= 0) {
        coords.xl = Math.max(coords.xl, coords.xi);
        return;
    }

    if (coords.yl - coords.yi <= 0) {
        coords.yl = Math.max(coords.yl, coords.yi);
        return;
    }

    var lines = this.screen.lines,
        xi = coords.xi,
        xl = coords.xl,
        yi = coords.yi,
        yl = coords.yl,
        x,
        y,
        cell,
        attr,
        ch,
        content = this._pcontent,
        ci = this._clines.ci[coords.base],
        battr,
        dattr,
        c,
        visible,
        i,
        bch = this.ch;

    if (coords.base >= this._clines.ci.length) {
        ci = this._pcontent.length;
    }

    this.lpos = coords;

    if (this.border && this.border.type !== 'ch') {
        this.screen._borderStops[coords.yi] = true;
        this.screen._borderStops[coords.yl - 1] = true;
    }

    dattr = this.sattr(this.style);
    attr = dattr;

    // If we're in a scrollable text box, check to
    // see which attributes this line starts with.
    if (ci > 0) {
        attr =
            this._clines.attr[Math.min(coords.base, this._clines.length - 1)];
    }

    if (this.border) xi++, xl--, yi++, yl--;

    // If we have padding/valign, that means the
    // content-drawing loop will skip a few cells/lines.
    // To deal with this, we can just fill the whole thing
    // ahead of time. This could be optimized.
    if (this.tpadding || (this.valign && this.valign !== 'top')) {
        if (this.style.transparent) {
            for (y = Math.max(yi, 0); y < yl; y++) {
                if (!lines[y]) break;
                for (x = Math.max(xi, 0); x < xl; x++) {
                    if (!lines[y][x]) break;
                    lines[y][x][0] = blessed.colors.blend(attr, lines[y][x][0]);
                    // lines[y][x][1] = bch;
                    lines[y].dirty = true;
                }
            }
        } else {
            this.screen.fillRegion(dattr, bch, xi, xl, yi, yl);
        }
    }

    if (this.tpadding) {
        (xi += this.padding.left), (xl -= this.padding.right);
        (yi += this.padding.top), (yl -= this.padding.bottom);
    }

    // Determine where to place the text if it's vertically aligned.
    if (this.valign === 'middle' || this.valign === 'bottom') {
        visible = yl - yi;
        if (this._clines.length < visible) {
            if (this.valign === 'middle') {
                visible = (visible / 2) | 0;
                visible -= (this._clines.length / 2) | 0;
            } else if (this.valign === 'bottom') {
                visible -= this._clines.length;
            }
            ci -= visible * (xl - xi);
        }
    }

    // Draw the content and background.
    if (renderContent) {
        for (y = yi; y < yl; y++) {
            if (!lines[y]) {
                if (y >= this.screen.height || yl < this.ibottom) {
                    break;
                } else {
                    continue;
                }
            }

            for (x = xi; x < xl; x++) {
                cell = lines[y][x];
                if (!cell) {
                    if (x >= this.screen.width || xl < this.iright) {
                        break;
                    } else {
                        continue;
                    }
                }

                ch = content[ci++] || bch;

                // if (!content[ci] && !coords._contentEnd) {
                //   coords._contentEnd = { x: x - xi, y: y - yi };
                // }

                // Handle escape codes.
                while (ch === '\x1b') {
                    if (
                        !(
                            content.substring(ci - 1).includes('\x1b[38;2') ||
                            content.substring(ci - 1).includes('\x1b[48;2')
                        ) &&
                        (c = /^\x1b\[[\d;]*m/.exec(content.substring(ci - 1)))
                    ) {
                        ci += c[0].length - 1;
                        attr = this.screen.attrCode(c[0], attr, dattr);
                        // Ignore foreground changes for selected items.
                        if (
                            attr !== null &&
                            this.parent._isList &&
                            this.parent.interactive &&
                            this.parent.items[this.parent.selected] === this &&
                            this.parent.options.invertSelected !== false
                        ) {
                            attr =
                                (attr & ~(0x1ff << 9)) | (dattr & (0x1ff << 9));
                        }
                        ch = content[ci] || bch;
                        ci++;
                    } else {
                        break;
                    }
                }

                // Handle newlines.
                if (ch === '\t') ch = bch;
                if (ch === '\n') {
                    // If we're on the first cell and we find a newline and the last cell
                    // of the last line was not a newline, let's just treat this like the
                    // newline was already "counted".
                    if (x === xi && y !== yi && content[ci - 2] !== '\n') {
                        x--;
                        continue;
                    }
                    // We could use fillRegion here, name the
                    // outer loop, and continue to it instead.
                    ch = bch;
                    for (; x < xl; x++) {
                        cell = lines[y][x];
                        if (!cell) break;
                        if (this.style.transparent) {
                            lines[y][x][0] = blessed.colors.blend(
                                attr,
                                lines[y][x][0]
                            );
                            if (content[ci]) lines[y][x][1] = ch;
                            lines[y].dirty = true;
                        } else {
                            if (attr !== cell[0] || ch !== cell[1]) {
                                lines[y][x][0] = attr;
                                lines[y][x][1] = ch;
                                lines[y].dirty = true;
                            }
                        }
                    }
                    continue;
                }

                if (this.screen.fullUnicode && content[ci - 1]) {
                    var point = blessed.unicode.codePointAt(content, ci - 1);
                    // Handle combining chars:
                    // Make sure they get in the same cell and are counted as 0.
                    if (blessed.unicode.combining[point]) {
                        if (point > 0x00ffff) {
                            ch = content[ci - 1] + content[ci];
                            ci++;
                        }
                        if (x - 1 >= xi) {
                            lines[y][x - 1][1] += ch;
                        } else if (y - 1 >= yi) {
                            lines[y - 1][xl - 1][1] += ch;
                        }
                        x--;
                        continue;
                    }
                    // Handle surrogate pairs:
                    // Make sure we put surrogate pair chars in one cell.
                    if (point > 0x00ffff) {
                        ch = content[ci - 1] + content[ci];
                        ci++;
                    }
                }

                if (this._noFill) continue;

                if (this.style.transparent) {
                    lines[y][x][0] = blessed.colors.blend(attr, lines[y][x][0]);
                    if (content[ci]) lines[y][x][1] = ch;
                    lines[y].dirty = true;
                } else {
                    if (attr !== cell[0] || ch !== cell[1]) {
                        lines[y][x][0] = attr;
                        lines[y][x][1] = ch;
                        lines[y].dirty = true;
                    }
                }
            }
        }
    }

    // Draw the scrollbar.
    // Could possibly draw this after all child elements.
    if (this.scrollbar && this.noScrollbar !== true) {
        // XXX
        // i = this.getScrollHeight();
        i = Math.max(this._clines.length, this._scrollBottom());
    }
    if (coords.notop || coords.nobot) i = -Infinity;
    if (this.scrollbar && this.noScrollbar !== true && yl - yi < i) {
        x = xl - 1;
        if (this.scrollbar.ignoreBorder && this.border) x++;

        if (this.alwaysScroll) {
            y = this.childBase / (i - (yl - yi));
        } else {
            y = (this.childBase + this.childOffset) / (i - 1);
        }
        y = yi + (((yl - yi) * y) | 0);
        if (y >= yl) y = yl - 1;

        cell = lines[y] && lines[y][x];
        if (cell) {
            if (this.track) {
                ch = this.track.ch || ' ';
                attr = this.sattr(
                    this.style.track,
                    this.style.track.fg || this.style.fg,
                    this.style.track.bg || this.style.bg
                );
                this.screen.fillRegion(attr, ch, x, x + 1, yi, yl);
            }
            ch = this.scrollbar.ch || ' ';
            attr = this.sattr(
                this.style.scrollbar,
                this.style.scrollbar.fg || this.style.fg,
                this.style.scrollbar.bg || this.style.bg
            );
            if (attr !== cell[0] || ch !== cell[1]) {
                lines[y][x][0] = attr;
                lines[y][x][1] = ch;
                lines[y].dirty = true;
            }
        }
    }

    if (this.border && this.noBorder !== true) xi--, xl++, yi--, yl++;

    if (this.tpadding) {
        (xi -= this.padding.left), (xl += this.padding.right);
        (yi -= this.padding.top), (yl += this.padding.bottom);
    }

    // Draw the border.
    // PATCH

    let type;
    let boxStyle;

    if (
        (this.border && this.border.type) ||
        (this.style.border && this.style.border.type)
    ) {
        type = this.style.border ? this.style.border.type : this.border.type;

        boxStyle = boxStyles[type];
    }

    if (!boxStyle) {
        boxStyle = boxStyles.light;
    }

    coords.notop = false;
    if (this.border && this.noBorder !== true) {
        battr = this.sattr(this.style.border);

        const originalAttr = battr;

        let markAttr = battr;

        let bFg = 1;

        let bBg = markAttr & 0x1ff;
        markAttr &= ~0x1ff;
        markAttr |= bBg;
        markAttr &= ~(0x1ff << 9);
        markAttr |= bFg << 9;

        const mark = this.borderMark ? this.borderMark : null;

        let location = 'top';

        y = yi;
        if (coords.notop) y = -1;

        location = '';
        for (x = xi; x < xl; x++) {
            if (!lines[y]) break;
            if (coords.noleft && x === xi) continue;
            if (coords.noright && x === xl - 1) continue;

            if (x === xi) {
                if (y === yi) {
                    location = 'top-left';
                } else if (y === yl - 1) {
                    location = 'bottom-left';
                } else {
                    location = 'left';
                }
            } else if (x === xl - 1) {
                if (y === yi) {
                    location = 'top-right';
                } else if (y === yl - 1) {
                    location = 'bottom-right';
                } else {
                    location = 'right';
                }
            } else {
                if (y === yi) {
                    location = 'top';
                } else if (y === yl - 1) {
                    location = 'bottom';
                }
            }

            if (mark && mark.includes(location)) {
                battr = markAttr;
            } else {
                battr = originalAttr;
            }

            cell = lines[y][x];
            if (!cell) continue;
            if (this.border.type !== 'ch') {
                if (x === xi) {
                    ch = boxStyle.topLeft;
                    //ch = '\u250c'; // '┌'
                    if (!this.border.left) {
                        if (this.border.top) {
                            ch = boxStyle.top;
                            //ch = '\u2500'; // '─'
                        } else {
                            continue;
                        }
                    } else {
                        if (!this.border.top) {
                            ch = boxStyle.left;
                            //ch = '\u2502'; // '│'
                        }
                    }
                } else if (x === xl - 1) {
                    ch = boxStyle.topRight;
                    //ch = '\u2510'; // '┐'
                    if (!this.border.right) {
                        if (this.border.top) {
                            ch = boxStyle.top;
                            //ch = '\u2500'; // '─'
                        } else {
                            continue;
                        }
                    } else {
                        if (!this.border.top) {
                            ch = boxStyle.right;
                            //ch = '\u2502'; // '│'
                        }
                    }
                } else {
                    ch = boxStyle.bottom;
                    //ch = '\u2500'; // '─'
                }
            } else if (this.border.type === 'bg') {
                ch = this.border.ch;
            }

            if (!this.border.top && x !== xi && x !== xl - 1) {
                ch = ' ';
                if (dattr !== cell[0] || ch !== cell[1]) {
                    lines[y][x][0] = dattr;
                    lines[y][x][1] = ch;
                    lines[y].dirty = true;

                    continue;
                }
            }
            if (battr !== cell[0] || ch !== cell[1]) {
                lines[y][x][0] = battr;
                lines[y][x][1] = ch;
                lines[y].dirty = true;
            }
        }
        y = yi + 1;
        location = '';
        for (; y < yl - 1; y++) {
            if (!lines[y]) continue;

            if (x === xi) {
                if (y === yi) {
                    location = 'top-left';
                } else if (y === yl - 1) {
                    location = 'bottom-left';
                } else {
                    location = 'left';
                }
            } else if (x === xl - 1) {
                if (y === yi) {
                    location = 'top-right';
                } else if (y === yl - 1) {
                    location = 'bottom-right';
                } else {
                    location = 'right';
                }
            } else {
                if (y === yi) {
                    location = 'top';
                } else if (y === yl - 1) {
                    location = 'bottom';
                }
            }

            if (mark && mark.includes(location)) {
                battr = markAttr;
            } else {
                battr = originalAttr;
            }

            cell = lines[y][xi];
            if (cell) {
                if (this.border.left) {
                    if (this.border.type !== 'ch') {
                        ch = boxStyle.left;
                        //ch = '\u2502'; // '│'
                    } else if (this.border.type === 'bg') {
                        ch = this.border.ch;
                    }
                    if (!coords.noleft)
                        if (battr !== cell[0] || ch !== cell[1]) {
                            lines[y][xi][0] = battr;
                            lines[y][xi][1] = ch;
                            lines[y].dirty = true;
                        }
                } else {
                    ch = ' ';
                    if (dattr !== cell[0] || ch !== cell[1]) {
                        lines[y][xi][0] = dattr;
                        lines[y][xi][1] = ch;
                        lines[y].dirty = true;
                    }
                }
            }
            cell = lines[y][xl - 1];
            if (cell) {
                if (this.border.right) {
                    if (this.border.type !== 'ch') {
                        ch = boxStyle.right;
                        //ch = '\u2502'; // '│'
                    } else if (this.border.type === 'bg') {
                        ch = this.border.ch;
                    }
                    if (!coords.noright)
                        if (battr !== cell[0] || ch !== cell[1]) {
                            lines[y][xl - 1][0] = battr;
                            lines[y][xl - 1][1] = ch;
                            lines[y].dirty = true;
                        }
                } else {
                    ch = ' ';
                    if (dattr !== cell[0] || ch !== cell[1]) {
                        lines[y][xl - 1][0] = dattr;
                        lines[y][xl - 1][1] = ch;
                        lines[y].dirty = true;
                    }
                }
            }
        }
        y = yl - 1;
        if (coords.nobot) y = -1;
        location = '';
        for (x = xi; x < xl; x++) {
            if (!lines[y]) break;
            if (coords.noleft && x === xi) continue;
            if (coords.noright && x === xl - 1) continue;
            cell = lines[y][x];
            if (!cell) continue;

            if (x === xi) {
                if (y === yi) {
                    location = 'top-left';
                } else if (y === yl - 1) {
                    location = 'bottom-left';
                } else {
                    location = 'left';
                }
            } else if (x === xl - 1) {
                if (y === yi) {
                    location = 'top-right';
                } else if (y === yl - 1) {
                    location = 'bottom-right';
                } else {
                    location = 'right';
                }
            } else {
                if (y === yi) {
                    location = 'top';
                } else if (y === yl - 1) {
                    location = 'bottom';
                }
            }

            if (mark && mark.includes(location)) {
                battr = markAttr;
            } else {
                battr = originalAttr;
            }

            if (this.border.type !== 'ch') {
                if (x === xi) {
                    ch = boxStyle.bottomLeft;
                    //ch = '\u2514'; // '└'
                    if (!this.border.left) {
                        if (this.border.bottom) {
                            ch = boxStyle.bottom;
                            //ch = '\u2500'; // '─'
                        } else {
                            continue;
                        }
                    } else {
                        if (!this.border.bottom) {
                            ch = boxStyle.left;
                            //ch = '\u2502'; // '│'
                        }
                    }
                } else if (x === xl - 1) {
                    ch = boxStyle.bottomRight;
                    //ch = '\u2518'; // '┘'
                    if (!this.border.right) {
                        if (this.border.bottom) {
                            ch = boxStyle.bottom;
                            //ch = '\u2500'; // '─'
                        } else {
                            continue;
                        }
                    } else {
                        if (!this.border.bottom) {
                            ch = boxStyle.right;
                            //ch = '\u2502'; // '│'
                        }
                    }
                } else {
                    ch = boxStyle.top;
                    //ch = '\u2500'; // '─'
                }
            } else if (this.border.type === 'bg') {
                ch = this.border.ch;
            }
            if (!this.border.bottom && x !== xi && x !== xl - 1) {
                ch = ' ';
                if (dattr !== cell[0] || ch !== cell[1]) {
                    lines[y][x][0] = dattr;
                    lines[y][x][1] = ch;
                    lines[y].dirty = true;
                }
                continue;
            }
            if (battr !== cell[0] || ch !== cell[1]) {
                lines[y][x][0] = battr;
                lines[y][x][1] = ch;
                lines[y].dirty = true;
            }
        }
    }

    /*
        Fancy pants shadow implementation
    */
    if (this.shadow) {
        let shAttr;
        let bg;
        let fg;
        let innerVal = 0.55;
        let outerVal = 0.35;

        if (Array.isArray(this.shadow)) {
            const [optInnerVal, optOuterVal] = this.shadow;

            innerVal = optInnerVal || innerVal;
            outerVal = optOuterVal || outerVal;
        }

        y = Math.max(yi + 1, 0);
        for (; y < yl + 2; y++) {
            if (!lines[y]) break;
            x = xl;
            for (; x < xl + 2; x++) {
                if (!lines[y][x]) break;

                let inner = x - xl === 0 && y < yl + 1;

                shAttr = lines[y][x][0];

                bg = shAttr & 0x1ff;

                oBg = bg;

                if (bg <= 0 || bg === 0x1ff) {
                    bg = 0;
                } else {
                    bg = blessed.colors.darken(
                        bg,
                        inner ? innerVal : outerVal,
                        'bg'
                    );
                }

                shAttr &= ~0x1ff;
                shAttr |= bg;

                fg = (shAttr >> 9) & 0x1ff;

                fg = blessed.colors.darken(
                    fg,
                    inner ? innerVal : outerVal,
                    'fg'
                );

                shAttr &= ~(0x1ff << 9);
                shAttr |= fg << 9;

                lines[y][x][0] = shAttr;
                lines[y].dirty = true;
            }
        }
        // bottom
        y = yl;

        for (; y < yl + 2; y++) {
            if (!lines[y]) break;
            for (x = Math.max(xi + 1, 0); x < xl; x++) {
                if (!lines[y][x]) break;

                let inner = y < yl + 1;

                shAttr = lines[y][x][0];

                bg = shAttr & 0x1ff;
                oBg = bg;

                if (bg <= 0 || bg === 0x1ff) {
                    bg = 0;
                } else {
                    bg = blessed.colors.darken(
                        bg,
                        inner ? innerVal : outerVal,
                        'bg'
                    );
                }

                shAttr &= ~0x1ff;
                shAttr |= bg;

                fg = (shAttr >> 9) & 0x1ff;

                fg = blessed.colors.darken(
                    fg,
                    inner ? innerVal : outerVal,
                    'fg'
                );

                shAttr &= ~(0x1ff << 9);
                shAttr |= fg << 9;

                lines[y][x][0] = shAttr;

                lines[y].dirty = true;
            }
        }
    }

    this.children.forEach(function (el) {
        if (el.screen._ci !== -1) {
            el.index = el.screen._ci++;
        }

        el.render();
    });

    this._emit('render', [coords]);

    this.renderCoords = coords;

    return coords;
};

blessed.Element.prototype._render = blessed.Element.prototype.render;
/*
    Make .hidden a bit more robust by checking immediate parent, so it's viable to
    use in place of .visible (which recurses up the node tree on every execution)
*/
blessed.Element.prototype.__defineGetter__('hidden', function () {
    if (this._hidden || !this.parent) {
        return true;
    }

    if (this.parent._hidden) {
        return true;
    }

    return false;
});

blessed.Element.prototype.__defineSetter__('hidden', function (value) {
    this._hidden = value;
});

// See the Panel layout initItem method and UiLogger updateLabelAndStyle method
// The idea is that this gets overriden by a parent element, so depending on
// the sitation, calls to setStyle can be applied to the parent or to the child
blessed.Element.prototype.setStyle = function (key, opts) {
    if (key && !this.style[key]) {
        this.style[key] = {};
    }

    const style = key ? this.style[key] : this.style;

    if (typeof opts === 'string') {
        style.fg = opts;
    } else {
        for (const [key, val] of Object.entries(opts)) {
            style[key] = val;
        }
    }
};

blessed.Element.prototype.isInside = function (x, y) {
    if (this.screen.hover === this) {
        return true;
    }

    if (this.hidden || this.detached) {
        return false;
    }

    let pos;

    try {
        pos = this._getPos();
    } catch {}

    if (!pos) {
        return false;
    }

    if (x >= pos.xi && x < pos.xl && y >= pos.yi && y < pos.yl) {
        return true;
    }
    return false;
};

blessed.Element.prototype.isOutside = function (x, y) {
    if (this.hidden || this.detached) {
        return false;
    }

    let pos;
    this.lastOutPos = this.lastOutPos || null;

    try {
        pos = this._getPos();
    } catch {}

    if (!pos) {
        if (this.lastOutPos) {
            pos = this.lastOutPos;
        } else {
            return false;
        }
    } else {
        this.lastOutPos = pos;
    }

    let isRight = false;
    let isLeft = false;
    let isAbove = false;
    let isBelow = false;

    if (y < pos.yi) {
        isAbove = true;
    } else if (y >= pos.yl) {
        isBelow = true;
    }

    if (x < pos.xi) {
        isLeft = true;
    } else if (x >= pos.xl) {
        isRight = true;
    }

    let where = '';

    if (isRight && !isAbove && !isBelow) {
        where = 'right';
    } else if (isRight && isAbove) {
        where = 'above-right';
    } else if (isRight && isBelow) {
        where = 'below-right';
    } else if (isLeft && !isAbove && !isBelow) {
        where = 'left';
    } else if (isLeft && isAbove) {
        where = 'above-left';
    } else if (isLeft && isBelow) {
        where = 'below-left';
    } else if (isAbove) {
        where = 'above';
    } else if (isBelow) {
        where = 'below';
    }

    if (where === '') {
        return false;
    }

    const offset = { x: 0, y: 0 };

    if (isRight) {
        offset.x = x - pos.xl;
    } else if (isLeft) {
        offset.x = x - pos.xi;
    }

    if (isAbove) {
        offset.y = y - pos.yi;
    } else if (isBelow) {
        offset.y = y - pos.yl;
    }

    return { where, offset };
};

const rendering = {};
const renderTail = {};

blessed.Element.prototype.fullRender = function (type) {
    const { depth, screen } = this;

    type = type || this.uiType || this.type;

    const key = `${type}_${depth}`;

    if (rendering[key]) {
        renderTail[key] = true;
        return;
    }

    screen.render();

    rendering[key] = true;
    renderTail[key] = false;

    setTimeout(() => {
        if (renderTail[key]) {
            screen.render();
        }

        rendering[key] = false;
        renderTail[key] = false;
    }, 15);
};
