const blessed = require('blessed');
const { requiredOption } = require('commander');
const debounce = require('lodash.debounce');
const throttle = require('lodash.throttle');
const sgr = require('./sgr');

var nextTick = global.setImmediate || process.nextTick.bind(process);

//Unicode handling (issues with emojis, mainly)
blessed.Screen.prototype.draw = function (start, end) {
    var x, y, line, out, ch, data, uni, attr, fg, bg, flags, len;

    var main = '',
        pre,
        post;

    var clr, neq, xx;

    var lx = -1,
        ly = -1,
        o;

    var acs;

    if (start < 0) {
        start = 0;
    }

    if (this._buf) {
        main += this._buf;
        this._buf = '';
    }

    for (y = start; y <= end; y++) {
        if (!this.lines[y]) {
            continue;
        }

        line = this.lines[y];
        o = this.olines[y];

        if (!line.dirty && !(this.cursor.artificial && y === this.program.y)) {
            continue;
        }

        line.dirty = false;

        out = '';
        attr = this.dattr;

        len = line.length - 1;

        for (x = 0; x < len; x++) {
            data = line[x][0];
            uni = line[x][2] !== undefined ? line[x][2] : null;
            ch = line[x][1];

            // Render the artificial cursor.
            if (
                this.cursor.artificial &&
                !this.cursor._hidden &&
                this.cursor._state &&
                x === this.program.x &&
                y === this.program.y
            ) {
                var cattr = this._cursorAttr(this.cursor, data);
                if (cattr.ch) ch = cattr.ch;
                data = cattr.attr;
            }

            // Take advantage of xterm's back_color_erase feature by using a
            // lookahead. Stop spitting out so many damn spaces. NOTE: Is checking
            // the bg for non BCE terminals worth the overhead?
            if (
                this.options.useBCE &&
                ch === ' ' &&
                (this.tput.bools.back_color_erase ||
                    (data & 0x1ff) === (this.dattr & 0x1ff)) &&
                ((data >> 18) & 8) === ((this.dattr >> 18) & 8)
            ) {
                clr = true;
                neq = false;

                for (xx = x; xx < line.length; xx++) {
                    if (line[xx][0] !== data || line[xx][1] !== ' ') {
                        clr = false;
                        break;
                    }
                    if (line[xx][0] !== o[xx][0] || line[xx][1] !== o[xx][1]) {
                        neq = true;
                    }
                }

                if (clr && neq) {
                    (lx = -1), (ly = -1);
                    if (data !== attr) {
                        out += this.codeAttr(data);
                        attr = data;
                    }
                    out += this.tput.cup(y, x);
                    out += this.tput.el();
                    for (xx = x; xx < line.length; xx++) {
                        o[xx][0] = data;
                        o[xx][1] = ' ';
                        o[xx][2] = uni;
                    }
                    break;
                }
            }

            // Optimize by comparing the real output
            // buffer to the pending output buffer.
            if (data === o[x][0] && ch === o[x][1]) {
                if (lx === -1) {
                    lx = x;
                    ly = y;
                }
                continue;
            } else if (lx !== -1) {
                if (this.tput.strings.parm_right_cursor) {
                    out +=
                        y === ly ? this.tput.cuf(x - lx) : this.tput.cup(y, x);
                } else {
                    out += this.tput.cup(y, x);
                }
                (lx = -1), (ly = -1);
            }
            o[x][0] = data;
            o[x][1] = ch;
            o[x][2] = uni;

            if (data !== attr) {
                if (attr !== this.dattr) {
                    out += '\x1b[m';
                }
                if (data !== this.dattr) {
                    out += '\x1b[';

                    bg = data & 0x1ff;
                    fg = (data >> 9) & 0x1ff;
                    flags = data >> 18;

                    if (flags & sgr.bold.flag) {
                        out += `${sgr.bold.param.on};`;
                    }

                    if (flags & sgr.underline.flag) {
                        out += `${sgr.underline.param.on};`;
                    }

                    if (flags & sgr.blink.flag) {
                        out += `${sgr.blink.param.on};`;
                    }

                    if (flags & sgr.inverse.flag) {
                        out += `${sgr.inverse.param.on};`;
                    }

                    if (flags & sgr.invisible.flag) {
                        out += `${sgr.invisible.param.on};`;
                    }

                    if (flags & sgr.italics.flag) {
                        out += `${sgr.italics.param.on};`;
                    }

                    if (bg !== 0x1ff) {
                        bg = this._reduceColor(bg);
                        if (bg < 16) {
                            if (bg < 8) {
                                bg += 40;
                            } else if (bg < 16) {
                                bg -= 8;
                                bg += 100;
                            }
                            out += bg + ';';
                        } else {
                            out += '48;5;' + bg + ';';
                        }
                    }

                    if (fg !== 0x1ff) {
                        fg = this._reduceColor(fg);
                        if (fg < 16) {
                            if (fg < 8) {
                                fg += 30;
                            } else if (fg < 16) {
                                fg -= 8;
                                fg += 90;
                            }
                            out += fg + ';';
                        } else {
                            out += '38;5;' + fg + ';';
                        }
                    }

                    if (out[out.length - 1] === ';') out = out.slice(0, -1);

                    out += 'm';
                }
            }
            /*
                To handle Unicode v11 glyphs being displayed by Terminal elements,
                instead of re-writing Blessed's unicode handling stuff (a huge pain),
                I just added a flag to the Terminal's cells (index 2), to indicate combo/double width characters.
            */
            if (this.fullUnicode) {
                if (
                    blessed.unicode.charWidth(line[x][1]) === 2 ||
                    uni === true
                ) {
                    line[x].length = 2;

                    if (x === line.length - 1 || angles[line[x + 1][1]]) {
                        ch = ' ';
                        o[x][1] = '\0';
                    } else {
                        o[x][1] = '\0';
                        o[++x][1] = '\0';
                    }
                }
            }

            if (
                this.tput.strings.enter_alt_charset_mode &&
                !this.tput.brokenACS &&
                (this.tput.acscr[ch] || acs)
            ) {
                if (this.tput.acscr[ch]) {
                    if (acs) {
                        ch = this.tput.acscr[ch];
                    } else {
                        ch = this.tput.smacs() + this.tput.acscr[ch];
                        acs = true;
                    }
                } else if (acs) {
                    ch = this.tput.rmacs() + ch;
                    acs = false;
                }
            } else {
                if (
                    !this.tput.unicode &&
                    this.tput.numbers.U8 !== 1 &&
                    ch > '~'
                ) {
                    ch = this.tput.utoa[ch] || '?';
                }
            }

            out += ch;
            attr = data;
        }

        if (attr !== this.dattr) {
            out += '\x1b[m';
        }

        if (out) {
            main += this.tput.cup(y, 0) + out;
        }
    }

    if (acs) {
        main += this.tput.rmacs();
        acs = false;
    }

    if (main) {
        pre = '';
        post = '';

        pre += this.tput.sc();
        post += this.tput.rc();

        if (!this.program.cursorHidden) {
            pre += this.tput.civis();
            post += this.tput.cnorm();
        }

        this.program._write(pre + main + post);
    }
};

// Italics
blessed.Screen.prototype.attrCode = function (code, cur, def) {
    var flags = (cur >> 18) & 0x1ff,
        fg = (cur >> 9) & 0x1ff,
        bg = cur & 0x1ff,
        c,
        n,
        i;

    code = code.slice(2, -1).split(';');
    if (!code[0]) code[0] = '0';

    for (i = 0; i < code.length; i++) {
        c = +code[i] || 0;
        switch (c) {
            case 0: // normal
                bg = def & 0x1ff;
                fg = (def >> 9) & 0x1ff;
                flags = (def >> 18) & 0x1ff;
                break;
            case sgr.bold.param.on:
                flags |= sgr.bold.flag;
                break;
            case sgr.bold.param.off:
                flags = (def >> 18) & 0x1ff;
                break;
            case sgr.underline.param.on:
                flags |= sgr.underline.flag;
                break;
            case sgr.underline.param.off:
                flags = (def >> 18) & 0x1ff;
                break;

            case sgr.blink.param.on:
                flags |= sgr.blink.flag;
                break;
            case sgr.blink.param.off:
                flags = (def >> 18) & 0x1ff;
                break;

            case sgr.inverse.param.on:
                flags |= sgr.inverse.flag;
                break;
            case sgr.inverse.param.off:
                flags = (def >> 18) & 0x1ff;
                break;

            case sgr.italics.param.on:
                flags |= sgr.italics.flag;
                break;
            case sgr.italics.param.off:
                flags = (def >> 18) & 0x1ff;
                break;

            case sgr.frame.param.on:
                flags |= sgr.frame.flag;
                break;
            case sgr.frame.param.off:
                flags = (def >> 18) & 0x1ff;
                break;

            case sgr.encircle.param.on:
                flags |= sgr.encircle.flag;
                break;
            case sgr.encircle.param.off:
                flags = (def >> 18) & 0x1ff;
                break;

            case sgr.invisible.param.on:
                flags |= sgr.invisible.flag;
                break;
            case 28:
                flags = (def >> 18) & 0x1ff;
                break;
            case 39: // default fg
                fg = (def >> 9) & 0x1ff;
                break;
            case 49: // default bg
                bg = def & 0x1ff;
                break;
            case 100: // default fg/bg
                fg = (def >> 9) & 0x1ff;
                bg = def & 0x1ff;
                break;
            default:
                if (c === 48 && +code[i + 1] === 5) {
                    i += 2;
                    bg = +code[i];
                    break;
                } else if (c === 48 && +code[i + 1] === 2) {
                    i += 2;
                    bg = blessed.colors.convert(
                        [+code[i], +code[i + 1], +code[i + 2]],
                        'bg'
                    );
                    if (bg === -1) bg = def & 0x1ff;
                    i += 2;
                    break;
                } else if (c === 38 && +code[i + 1] === 5) {
                    i += 2;
                    fg = +code[i];
                    break;
                } else if (c === 38 && +code[i + 1] === 2) {
                    i += 2;
                    fg = blessed.colors.convert(
                        [+code[i], +code[i + 1], +code[i + 2]],
                        'fg'
                    );
                    if (fg === -1) fg = (def >> 9) & 0x1ff;
                    i += 2;
                    break;
                }
                if (c >= 40 && c <= 47) {
                    bg = c - 40;
                } else if (c >= 100 && c <= 107) {
                    bg = c - 100;
                    bg += 8;
                } else if (c === 49) {
                    bg = def & 0x1ff;
                } else if (c >= 30 && c <= 37) {
                    fg = c - 30;
                } else if (c >= 90 && c <= 97) {
                    fg = c - 90;
                    fg += 8;
                } else if (c === 39) {
                    fg = (def >> 9) & 0x1ff;
                } else if (c === 100) {
                    fg = (def >> 9) & 0x1ff;
                    bg = def & 0x1ff;
                }
                break;
        }
    }

    return (flags << 18) | (fg << 9) | bg;
};

// Italics
blessed.Screen.prototype.codeAttr = function (code) {
    var flags = (code >> 18) & 0x1ff,
        fg = (code >> 9) & 0x1ff,
        bg = code & 0x1ff,
        out = '';

    if (flags & sgr.bold.flag) {
        out += `${sgr.bold.param.on};`;
    }

    if (flags & sgr.underline.flag) {
        out += `${sgr.underline.param.on};`;
    }

    if (flags & sgr.blink.flag) {
        out += `${sgr.blink.param.on};`;
    }

    if (flags & sgr.inverse.flag) {
        out += `${sgr.inverse.param.on};`;
    }

    if (flags & sgr.invisible.flag) {
        out += `${sgr.invisible.param.on};`;
    }

    if (flags & sgr.italics.flag) {
        out += `${sgr.italics.param.on};`;
    }

    if (flags & sgr.frame.flag) {
        out += `${sgr.frame.param.on};`;
    }

    if (flags & sgr.encircle.flag) {
        out += `${sgr.encircle.param.on};`;
    }

    if (bg !== 0x1ff) {
        bg = this._reduceColor(bg);
        if (bg < 16) {
            if (bg < 8) {
                bg += 40;
            } else if (bg < 16) {
                bg -= 8;
                bg += 100;
            }
            out += bg + ';';
        } else {
            out += '48;5;' + bg + ';';
        }
    }

    if (fg !== 0x1ff) {
        fg = this._reduceColor(fg);
        if (fg < 16) {
            if (fg < 8) {
                fg += 30;
            } else if (fg < 16) {
                fg -= 8;
                fg += 90;
            }
            out += fg + ';';
        } else {
            out += '38;5;' + fg + ';';
        }
    }

    if (out[out.length - 1] === ';') out = out.slice(0, -1);

    return '\x1b[' + out + 'm';
};

// This will probably be removed. self.focusEmit is used to short-circuit key events
// to get various Modal-relatd UI behaviors to feel/work right
blessed.Screen.prototype._listenKeys = function (el) {
    var self = this;

    if (el && !~this.keyable.indexOf(el)) {
        el.keyable = true;
        this.keyable.push(el);
    }

    if (this._listenedKeys) return;
    this._listenedKeys = true;

    this.program.on('keypress', function (ch, key) {
        // PATCH: screen.focusEmit can be set to a widget to restrict all keypresses to just that widget
        // avoids the need to negotiate .grabKeys and .ignoreLocked (sort of). Used with the Help modal.
        if (
            typeof self.focusEmit === 'object' &&
            typeof self.focusEmit.emit === 'function'
        ) {
            if (self.focusEmit.emit) {
                try {
                    self.focusEmit.emit('keypress', ch, key);
                    self.focusEmit.emit('key ' + key.full, ch, key);
                } catch (err) { }
            }
            return;
        }

        if (self.lockKeys && !~self.ignoreLocked.indexOf(key.full)) {
            return;
        }

        var focused = self.focused,
            grabKeys = self.grabKeys;

        if (!grabKeys || ~self.ignoreLocked.indexOf(key.full)) {
            self.emit('keypress', ch, key);
            self.emit('key ' + key.full, ch, key);
        }

        if (
            self.grabKeys !== grabKeys ||
            self.lockKeys ||
            self.noScreenEmit === true
        ) {
            return;
        }

        if (self.focusEmit !== true && focused && focused.keyable) {
            focused.emit('keypress', ch, key);
            focused.emit('key ' + key.full, ch, key);
        }
    });
};

blessed.Screen.prototype._listenMouse = function (el) {
    var self = this;

    if (el && !~this.clickable.indexOf(el)) {
        el.clickable = true;
        this.clickable.push(el);

        if (el.grabMouse) {
            this._oneGrabMouse = true;
        }
    }

    if (this._listenedMouse) return;
    this._listenedMouse = true;

    this.program.enableMouse();
    if (this.options.sendFocus) {
        this.program.setMouse({ sendFocus: true }, true);
    }

    this.on('render', function () {
        self._needsClickableSort = true;
    });

    this.on('element click', function (el, data) {
        if (
            data.button === 'left' &&
            ((self.focused !== el && el.options.focusParent) ||
                (el.clickable === true &&
                    el.options.mouseFocus !== false &&
                    (el.options.autoFocus !== false ||
                        el.options.mouseFocus === true)))
        ) {
            if (el.options.focusParent && el.parent !== self.focused) {
                el.parent.focus();
            } else if (!el.options.focusParent) {
                el.focus();
            }
        }
    });

    this.on('mousemove', (data) => {
        if (self.lockKeys) return;

        if (self._needsClickableSort) {
            self.clickable = blessed.helpers.hsort(self.clickable);
            self._needsClickableSort = false;
        }

        var i = 0,
            el,
            set,
            pos;

        for (; i < self.clickable.length; i++) {
            el = self.clickable[i];

            if (
                el.detached ||
                !el.visible ||
                !el.focused ||
                !el.options.outsideMove
            ) {
                continue;
            }

            if (!el.options.outsideMoveBlurred && !el.focused) {
                continue;
            }

            if (['focus', 'blur'].includes(data.action)) {
                el.emit(data.action, data);
                continue;
            }

            pos = el.lpos;
            if (!pos) continue;

            const inside =
                data.x >= pos.xi &&
                data.x < pos.xl &&
                data.y >= pos.yi &&
                data.y < pos.yl;

            if (!inside) {
                if (el.options.outsideMove && data.action === 'mousemove') {
                    el._outsideInsideFired = false;
                    const location = el.isOutside(data.x, data.y);

                    if (el.options.outsideMove === true) {
                        el.emit('out-move', data, location);
                    } else if (Array.isArray(el.options.outsideMove)) {
                        if (
                            el.options.outsideMove.includes(location.where) ||
                            (el.options.outsideMove.includes('inside') &&
                                el.options.outsideMove.length === 1)
                        ) {
                            el.emit('out-move', data, location);
                        }
                    } else if (typeof el.options.outsideMove === 'string') {
                        if (
                            location.where === el.options.outsideMove ||
                            el.options.outsideMove === 'inside'
                        ) {
                            el.emit('out-move', data, location);
                        }
                    }
                }
            } else if (
                Array.isArray(el.options.outsideMove) &&
                el.options.outsideMove.includes('inside') &&
                !el._outsideInsideFired
            ) {
                el._outsideInsideFired = true;
                el.emit('out-move', data, false);
            }
        }
    });

    this.program.on('mouse', function (data) {
        if (self.lockKeys) return;

        if (self._needsClickableSort) {
            self.clickable = blessed.helpers.hsort(self.clickable);
            self._needsClickableSort = false;
        }

        var i = 0,
            el,
            set,
            pos;

        for (; i < self.clickable.length; i++) {
            el = self.clickable[i];

            if (el.detached || !el.visible || !el.clickable) {
                continue;
            }

            if (['focus', 'blur'].includes(data.action)) {
                el.emit(data.action, data);
                continue;
            }

            // PATCH BEGIN
            if (self.grabMouse && !el.grabMouse) {
                if (
                    !self.clickable
                        .filter((em) => em.grabMouse)
                        .some((em) => el.hasAncestor(em))
                )
                    continue;
            }
            // PATCH END

            pos = el.lpos;
            if (!pos) continue;

            const inside =
                data.x >= pos.xi &&
                data.x < pos.xl &&
                data.y >= pos.yi &&
                data.y < pos.yl;

            if (!inside) {
                if (el.options.outsideClick) {
                    if (data.action === 'mouseup') {
                        el.emit('out-click', data);
                    }
                }

                if (
                    el.options.outsideWheel &&
                    (data.action === 'wheelup' || data.action === 'wheeldown')
                ) {
                    el.emit(data.action, data);
                }
            }

            if (inside) {
                el.emit('mouse', data);
                if (data.action === 'mousedown') {
                    self.mouseDown = el;
                } else if (data.action === 'mouseup') {
                    (self.mouseDown || el).emit('click', data);
                    self.mouseDown = null;
                } else if (data.action === 'mousemove') {
                    if (self.hover && el.index > self.hover.index) {
                        set = false;
                    }
                    if (self.hover !== el && !set) {
                        if (self.hover) {
                            self.hover.emit('mouseout', data);
                        }
                        el.emit('mouseover', data);
                        self.hover = el;
                    }
                    set = true;
                }

                let emit = true;
                if (data.action === 'mousemove') {
                    emit = false;

                    if (
                        data.dragging ||
                        el.grabMouse ||
                        self.program.mouseDown
                    ) {
                        emit = true;
                    }

                    if (
                        Array.isArray(el.options.outsideMove) &&
                        el.options.outsideMove.includes('inside')
                    ) {
                        el.emit('out-move', data, false);
                    }
                }

                if (emit) {
                    el.emit(data.action, data);
                }

                break;
            }
        }

        // Just mouseover?
        if (
            (data.action === 'mousemove' ||
                data.action === 'mousedown' ||
                data.action === 'mouseup') &&
            self.hover &&
            !set
        ) {
            self.hover.emit('mouseout', data);
            self.hover = null;
        }

        self.emit('mouse', data);
        self.emit(data.action, data);
    });

    // Autofocus highest element.
    // this.on('element click', function (el, data) {
    //   var target;
    //   do {
    //     if (el.clickable === true && el.options.autoFocus !== false) {
    //       target = el;
    //     }
    //   } while (el = el.parent);
    //   if (target) target.focus();
    // });

    // Autofocus elements with the appropriate option.
};
// https://github.com/garden-io/neo-blessed/commit/995a8311de793ff2301f1f55fd7119c9ae910620
blessed.Screen.bind = function (screen) {
    if (!blessed.Screen.global) {
        blessed.Screen.global = screen;
    }

    if (!~blessed.Screen.instances.indexOf(screen)) {
        blessed.Screen.instances.push(screen);
        blessed.Screen.index = blessed.Screen.total;
        blessed.Screen.total++;
    }

    if (blessed.Screen._bound) return;
    blessed.Screen._bound = true;

    process.on(
        'uncaughtException',
        (blessed.Screen._exceptionHandler = function (err) {
            blessed.Screen.instances.slice().forEach(function (screen) {
                screen.destroy();
            });
            err = err || new Error('Uncaught Exception.');
            process.stderr.write((err.stack || err) + '\n');
            nextTick(function () {
                process.exit(1);
            });
        })
    );

    ['SIGTERM', 'SIGINT', 'SIGQUIT'].forEach(function (signal) {
        var name = '_' + signal.toLowerCase() + 'Handler';
        process.on(
            signal,
            (blessed.Screen[name] = function () {
                if (process.listeners(signal).length > 1) {
                    return;
                }
                nextTick(function () {
                    process.exit(0);
                });
            })
        );
    });

    process.on(
        'exit',
        (blessed.Screen._exitHandler = function () {
            blessed.Screen.instances.slice().forEach(function (screen) {
                screen.destroy();
            });
        })
    );
};

var angles = {
    '\u2518': true, // '┘'
    '\u2510': true, // '┐'
    '\u250c': true, // '┌'
    '\u2514': true, // '└'
    '\u253c': true, // '┼'
    '\u251c': true, // '├'
    '\u2524': true, // '┤'
    '\u2534': true, // '┴'
    '\u252c': true, // '┬'
    '\u2502': true, // '│'
    '\u2500': true, // '─'
};

/*
    "selected" is true for an element if element.options.selectable === true and it or any
    of its children currently have focus.

    Takes into account that elements could share a selectable parent in common, and
    also that elements can focus on a child on element focus/init
*/
blessed.Screen.prototype._updateSelected = function (select, self) {
    if (!self.parent) {
        return;
    }

    if (
        self.options.selectable &&
        self.selected !== select &&
        !this._selected.includes(self)
    ) {
        if (select) {
            this._selected.push(self);
        }

        self.selected = select;
        self.emit('selected', select, self);
        return;
    }

    let parent = self.parent;

    while (parent && parent !== this) {
        if (
            parent.options.selectable &&
            parent.selected !== select &&
            !this._selected.includes(parent)
        ) {
            if (select) {
                this._selected.push(parent);
            }

            parent.selected = select;
            parent.emit('selected', select, self);
        }

        if (parent.parent === this && parent.options.positionParent) {
            parent = parent.options.positionParent;
        } else {
            parent = parent.parent;
        }
    }
};

blessed.Screen.prototype._setUnselected = throttle(
    function (el) {
        const focused = this.focused;

        if (
            el &&
            el.parent &&
            el.parent !== focused.parent &&
            el !== focused.parent &&
            el !== focused.options.positionParent
        ) {
            this._updateSelected(false, el);
        }
    },
    5,
    { leading: false, trailing: true }
);

blessed.Screen.prototype._setSelection = function (focused, blurred) {
    if (focused) {
        this._updateSelected(true, focused);
    }

    if (
        blurred &&
        blurred.parent &&
        blurred.parent !== focused.parent &&
        blurred !== focused.parent &&
        blurred !== focused.options.positionParent
    ) {
        this._setUnselected(blurred);
    }
};

blessed.Screen.prototype._focus = function (self, old) {
    // optimization
    if (self === old) {
        return;
    }

    //'selected' state stuff
    this._selected = this._selected || [];
    this._selectTimeout = this._selectTimeout || null;

    if (this._selectTimeout === null) {
        this._selected = [];
    }

    clearTimeout(this._selectTimeout);

    this._selectTimeout = setTimeout(() => {
        this._selectTimeout = null;
    }, 50);

    this._setSelection(self, old);

    // Find a scrollable ancestor if we have one.
    var el = self;

    // optimization
    if (
        self._scrollableParent === undefined ||
        self._scrollableParent === true
    ) {
        self._scrollableParent = self._scrollableParent || false;

        while ((el = el.parent)) {
            if (el.scrollable) {
                self._scrollableParent = true;
                break;
            }
        }

        // If we're in a scrollable element,
        // automatically scroll to the focused element.
        if (el && !el.detached) {
            // NOTE: This is different from the other "visible" values - it needs the
            // visible height of the scrolling element itself, not the element within
            // it.
            var visible =
                self.screen.height -
                el.atop -
                el.itop -
                el.abottom -
                el.ibottom;
            if (self.rtop < el.childBase) {
                el.scrollTo(self.rtop);
                self.screen.render();
            } else if (
                self.rtop + self.height - self.ibottom >
                el.childBase + visible
            ) {
                // Explanation for el.itop here: takes into account scrollable elements
                // with borders otherwise the element gets covered by the bottom border:
                el.scrollTo(
                    self.rtop - (el.height - self.height) + el.itop,
                    true
                );
                self.screen.render();
            }
        }
    }

    if (old) {
        old.emit('blur', self);
    }

    self.emit('focus', old);
};



blessed.Screen.prototype.postEnter = function () {
    var self = this;
    if (this.options.debug) {
        this.debugLog = new blessed.Log({
            screen: this,
            parent: this,
            hidden: true,
            draggable: true,
            left: 'center',
            top: 'center+2',
            width: '50%',
            height: '50%',
            border: 'line',
            label: ' {bold}Debug Log{/bold} ',
            tags: true,
            keys: true,
            vi: true,
            mouse: true,
            scrollbar: {
                ch: ' ',
                track: {
                    bg: 'yellow'
                },
                style: {
                    inverse: true
                }
            },
            style: {
                bg: 'black',
                fg: 'white'
            }
        });

        this.debugLog.toggle = function () {
            if (self.debugLog.hidden) {
                self.saveFocus();
                self.debugLog.show();
                self.debugLog.setFront();
                self.debugLog.focus();
            } else {
                self.debugLog.hide();
                self.restoreFocus();
            }
            self.render();
        };

        this.debugLog.key(['q', 'escape'], self.debugLog.toggle);
        this.key('f12', self.debugLog.toggle);
    }

    if (this.options.warnings) {
        this.on('warning', function (text) {
            var warning = new Box({
                screen: self,
                parent: self,
                left: 'center',
                top: 'center',
                width: 'shrink',
                padding: 1,
                height: 'shrink',
                align: 'center',
                valign: 'middle',
                border: 'line',
                label: ' {red-fg}{bold}WARNING{/} ',
                content: '{bold}' + text + '{/bold}',
                tags: true
            });
            self.render();
            var timeout = setTimeout(function () {
                warning.destroy();
                self.render();
            }, 1500);
            if (timeout.unref) {
                timeout.unref();
            }
        });
    }
};
