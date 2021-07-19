const blessed = require('blessed');
const { Buffer } = require('buffer');
const { xyz } = require('color');
const { action } = require('commander');
const sgr = require('./sgr');

const nextTick = global.setImmediate || process.nextTick.bind(process);

/*
    These patches add the following:
    1. italics decoration (_attr)
    2. Additional keys (_listenInput)
    3. Return double-firing input fix (_listenInput)
    4. Pre-resize event (_listenOutput)
*/

blessed.Program.prototype._attr = function (param, val) {
    var self = this,
        parts,
        color,
        m;

    if (Array.isArray(param)) {
        parts = param;
        param = parts[0] || 'normal';
    } else {
        param = param || 'normal';
        parts = param.split(/\s*[,;]\s*/);
    }

    if (parts.length > 1) {
        var used = {},
            out = [];

        parts.forEach(function (part) {
            part = self._attr(part, val).slice(2, -1);
            if (part === '') return;
            if (used[part]) return;
            used[part] = true;
            out.push(part);
        });

        const joined = out.join(';');

        const writeLastM = !joined[joined.length - 1].includes('m');

        return '\x1b[' + out.join(';') + (writeLastM ? 'm' : '');
    }

    if (param.indexOf('no ') === 0) {
        param = param.substring(3);
        val = false;
    } else if (param.indexOf('!') === 0) {
        param = param.substring(1);
        val = false;
    }

    // PATCH: Adding more decorations...though only 'italics' seems to work
    if (sgr[param]) {
        if (!val) {
            return `\x1b[${sgr[param].off}`;
        }

        return `\x1b[${sgr[param].on}`;
    }

    switch (param) {
        // attributes
        case 'normal':
        case 'default':
            if (val === false) return '';
            return '\x1b[m';
        case 'bold':
            return val === false ? '\x1b[22m' : '\x1b[1m';
        case 'ul':
        case 'underline':
        case 'underlined':
            return val === false ? '\x1b[24m' : '\x1b[4m';
        case 'blink':
            return val === false ? '\x1b[25m' : '\x1b[5m';
        case 'inverse':
            return val === false ? '\x1b[27m' : '\x1b[7m';
        case 'invisible':
            return val === false ? '\x1b[28m' : '\x1b[8m';

        // 8-color foreground
        case 'black fg':
            return val === false ? '\x1b[39m' : '\x1b[30m';
        case 'red fg':
            return val === false ? '\x1b[39m' : '\x1b[31m';
        case 'green fg':
            return val === false ? '\x1b[39m' : '\x1b[32m';
        case 'yellow fg':
            return val === false ? '\x1b[39m' : '\x1b[33m';
        case 'blue fg':
            return val === false ? '\x1b[39m' : '\x1b[34m';
        case 'magenta fg':
            return val === false ? '\x1b[39m' : '\x1b[35m';
        case 'cyan fg':
            return val === false ? '\x1b[39m' : '\x1b[36m';
        case 'white fg':
        case 'light grey fg':
        case 'light gray fg':
        case 'bright grey fg':
        case 'bright gray fg':
            return val === false ? '\x1b[39m' : '\x1b[37m';
        case 'default fg':
            if (val === false) return '';
            return '\x1b[39m';

        // 8-color background
        case 'black bg':
            return val === false ? '\x1b[49m' : '\x1b[40m';
        case 'red bg':
            return val === false ? '\x1b[49m' : '\x1b[41m';
        case 'green bg':
            return val === false ? '\x1b[49m' : '\x1b[42m';
        case 'yellow bg':
            return val === false ? '\x1b[49m' : '\x1b[43m';
        case 'blue bg':
            return val === false ? '\x1b[49m' : '\x1b[44m';
        case 'magenta bg':
            return val === false ? '\x1b[49m' : '\x1b[45m';
        case 'cyan bg':
            return val === false ? '\x1b[49m' : '\x1b[46m';
        case 'white bg':
        case 'light grey bg':
        case 'light gray bg':
        case 'bright grey bg':
        case 'bright gray bg':
            return val === false ? '\x1b[49m' : '\x1b[47m';
        case 'default bg':
            if (val === false) return '';
            return '\x1b[49m';

        // 16-color foreground
        case 'light black fg':
        case 'bright black fg':
        case 'grey fg':
        case 'gray fg':
            return val === false ? '\x1b[39m' : '\x1b[90m';
        case 'light red fg':
        case 'bright red fg':
            return val === false ? '\x1b[39m' : '\x1b[91m';
        case 'light green fg':
        case 'bright green fg':
            return val === false ? '\x1b[39m' : '\x1b[92m';
        case 'light yellow fg':
        case 'bright yellow fg':
            return val === false ? '\x1b[39m' : '\x1b[93m';
        case 'light blue fg':
        case 'bright blue fg':
            return val === false ? '\x1b[39m' : '\x1b[94m';
        case 'light magenta fg':
        case 'bright magenta fg':
            return val === false ? '\x1b[39m' : '\x1b[95m';
        case 'light cyan fg':
        case 'bright cyan fg':
            return val === false ? '\x1b[39m' : '\x1b[96m';
        case 'light white fg':
        case 'bright white fg':
            return val === false ? '\x1b[39m' : '\x1b[97m';

        // 16-color background
        case 'light black bg':
        case 'bright black bg':
        case 'grey bg':
        case 'gray bg':
            return val === false ? '\x1b[49m' : '\x1b[100m';
        case 'light red bg':
        case 'bright red bg':
            return val === false ? '\x1b[49m' : '\x1b[101m';
        case 'light green bg':
        case 'bright green bg':
            return val === false ? '\x1b[49m' : '\x1b[102m';
        case 'light yellow bg':
        case 'bright yellow bg':
            return val === false ? '\x1b[49m' : '\x1b[103m';
        case 'light blue bg':
        case 'bright blue bg':
            return val === false ? '\x1b[49m' : '\x1b[104m';
        case 'light magenta bg':
        case 'bright magenta bg':
            return val === false ? '\x1b[49m' : '\x1b[105m';
        case 'light cyan bg':
        case 'bright cyan bg':
            return val === false ? '\x1b[49m' : '\x1b[106m';
        case 'light white bg':
        case 'bright white bg':
            return val === false ? '\x1b[49m' : '\x1b[107m';

        // non-16-color rxvt default fg and bg
        case 'default fg bg':
            if (val === false) return '';
            return this.term('rxvt') ? '\x1b[100m' : '\x1b[39;49m';

        default:
            if (/^[\d;]*$/.test(param)) {
                return '\x1b[' + param + 'm';
            }

            // 256-color fg and bg
            if (param[0] === '#') {
                param = param.replace(
                    /#(?:[0-9a-f]{3}){1,2}/i,
                    blessed.colors.match
                );
            }

            m = /^(-?\d+) (fg|bg)$/.exec(param);
            if (m) {
                color = +m[1];

                if (val === false || color === -1) {
                    return this._attr('default ' + m[2]);
                }

                //   color = blessed.colors.reduce(color, this.tput.colors);

                if (color < 16 || (this.tput && this.tput.colors <= 16)) {
                    if (m[2] === 'fg') {
                        if (color < 8) {
                            color += 30;
                        } else if (color < 16) {
                            color -= 8;
                            color += 90;
                        }
                    } else if (m[2] === 'bg') {
                        if (color < 8) {
                            color += 40;
                        } else if (color < 16) {
                            color -= 8;
                            color += 100;
                        }
                    }
                    return '\x1b[' + color + 'm';
                }

                if (m[2] === 'fg') {
                    return '\x1b[38;5;' + color + 'm';
                }

                if (m[2] === 'bg') {
                    return '\x1b[48;5;' + color + 'm';
                }
            }

            if (/^[\d;]*$/.test(param)) {
                return '\x1b[' + param + 'm';
            }

            return null;
    }
};

/*
    Require our modified keys file
*/
blessed.Program.prototype._listenInput = function () {
    //PATCH: customized keys (adding Alt-directions, Alt-home, Alt-end)
    var keys = require('./keys'),
        self = this;

    // Input
    this.input.on(
        'keypress',
        (this.input._keypressHandler = function (ch, key) {
            key = key || { ch: ch };

            if (
                key.name === 'undefined' ||
                key.code === '[M' ||
                key.code === '[I' ||
                key.code === '[O'
            ) {
                // A mouse sequence. The `keys` module doesn't understand these.
                return;
            }

            if (key.name === 'enter' && key.sequence === '\n') {
                key.name = 'linefeed';
            }

            if (!key.full) {
                var name =
                    (key.ctrl ? 'C-' : '') +
                    (key.meta ? 'M-' : '') +
                    (key.shift && key.name ? 'S-' : '') +
                    (key.name || ch);

                key.full = name;
            }

            if (key.name === 'return' && key.sequence === '\r') {
                /*
                    PATCH: This fixes the double input on 'return' problem with Shell terminals
                    ...not sure why this event needs to be re-emitted like this in the first place
                */
                //       self.input.emit('keypress', ch, merge({}, key, { name: 'enter' }));
            }

            blessed.Program.instances.forEach(function (program) {
                if (program.input !== self.input) return;
                if (program.closing === true) return;

                if (key.name === 'return' && key.sequence === '\r') {
                    program.emit(
                        'keypress',
                        ch,
                        merge({}, key, { name: 'enter' })
                    );
                }

                program.emit('keypress', ch, key);

                program.emit('key ' + name, ch, key);
            });
        })
    );

    this.input.on(
        'data',
        (this.input._dataHandler = function (data) {
            blessed.Program.instances.forEach(function (program) {
                if (program.input !== self.input) return;
                program.emit('data', data);
            });
        })
    );

    keys.emitKeypressEvents(this.input);
};

slice = Array.prototype.slice;

function merge(out) {
    slice.call(arguments, 1).forEach(function (obj) {
        Object.keys(obj).forEach(function (key) {
            out[key] = obj[key];
        });
    });
    return out;
}

/*
    Emit a pre-resize event
*/
blessed.Program.prototype._listenOutput = function () {
    var self = this;

    if (!this.output.isTTY) {
        nextTick(function () {
            self.emit('warning', 'Output is not a TTY');
        });
    }

    // Output
    function resize(program) {
        if (program.output !== self.output) return;
        program.cols = program.output.columns;
        program.rows = program.output.rows;
        program.emit('resize');
        program.resizing = false;
    }

    function timeoutResize() {
        blessed.Program.instances.forEach(function (program) {
            if (!program.options.resizeTimeout) {
                return resize();
            }
            if (program._resizeTimer) {
                clearTimeout(program._resizeTimer);
                delete program._resizeTimer;
            }
            var time =
                typeof program.options.resizeTimeout === 'number'
                    ? program.options.resizeTimeout
                    : 300;
            program._resizeTimer = setTimeout(() => {
                resize(program);
            }, time);
        });
    }

    this.output.on(
        'resize',
        (this.output._resizeHandler = function () {
            blessed.Program.instances.forEach(function (program) {
                if (!program || program.output !== self.output) return;
                if (program.resizing) return;

                program.resizing = true;
                program.emit('pre-resize', timeoutResize);
            });
        })
    );
};

/*
    Temporary fix. Stream objects are getting nulled before Blessed has finished cleanup on exit.
*/
blessed.Program.prototype.destroy = function () {
    var index = blessed.Program.instances.indexOf(this);

    if (~index) {
        blessed.Program.instances.splice(index, 1);
        blessed.Program.total--;

        this.flush();
        this._exiting = true;

        blessed.Program.global = blessed.Program.instances[0];

        if (blessed.Program.total === 0) {
            blessed.Program.global = null;

            process.removeListener('exit', blessed.Program._exitHandler);
            delete blessed.Program._exitHandler;

            delete blessed.Program._bound;
        }

        this.input._blessedInput--;
        this.output._blessedOutput--;

        if (this.input._blessedInput === 0) {
            if (this.input && this.input.removeListener) {
                this.input.removeListener(
                    'keypress',
                    this.input._keypressHandler
                );
                this.input.removeListener('data', this.input._dataHandler);
            }
            delete this.input._keypressHandler;
            delete this.input._dataHandler;

            if (this.input && this.input.setRawMode) {
                if (this.input.isRaw) {
                    this.input.setRawMode(false);
                }
                if (!this.input.destroyed) {
                    this.input.pause();
                }
            }
        }

        if (this.output._blessedOutput === 0) {
            if (this.input && this.input.removeListener) {
                this.output.removeListener(
                    'resize',
                    this.output._resizeHandler
                );
            }
            delete this.output._resizeHandler;
        }

        this.removeListener('newListener', this._newHandler);
        delete this._newHandler;

        this.destroyed = true;
        this.emit('destroy');
    }
};

blessed.Program.prototype.term = function (is) {
    if (is.includes('xterm') && this.terminal.includes('xterm')) {
        return true;
    }

    return this.terminal.indexOf(is) === 0;
};

blessed.Program.prototype._bindMouse = function (s, buf, stream = null) {
    this.detail = this.detail !== undefined ? this.detail : 1;

    var self = this,
        key,
        parts,
        b,
        x,
        y,
        mod,
        params,
        down,
        page,
        button;

    if (self.closing === true) return;

    if (!stream) {
        stream = this;
    }

    let deadcell = false;

    this.mouseDown = this.mouseDown || false;
    this.lastKey1 = this.lastKey1 || null;
    this.lastKey2 = this.lastKey2 || null;

    key = {
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        startX: this._dragging === true ? this._startX : null,
        startY: this._dragging === true ? this._startY : null,
        diffX: this._dragging === true ? this._diffX : 0,
        diffY: this._dragging === true ? this._diffY : 0,
        dragging: this._dragging === true,
        timeStamp: new Date().getTime(),
        vte: this.isVTE,
    };

    if (this._stopDragging) {
        this._stopDragging = false;
        this._startX = null;
        this._startY = null;
    }

    if (Buffer.isBuffer(s)) {
        if (s[0] > 127 && s[1] === undefined) {
            s[0] -= 128;
            s = '\x1b' + s.toString('utf-8');
        } else {
            s = s.toString('utf-8');
        }
    }

    b = buf[3];
    x = buf[4];
    y = buf[5];

    var bx = s.charCodeAt(4);
    var by = s.charCodeAt(5);
    if (
        buf[0] === 0x1b &&
        buf[1] === 0x5b &&
        buf[2] === 0x4d &&
        (this.isVTE ||
            bx >= 65533 ||
            by >= 65533 ||
            (bx > 0x00 && bx < 0x20) ||
            (by > 0x00 && by < 0x20) ||
            (buf[4] > 223 && buf[4] < 248 && buf.length === 6) ||
            (buf[5] > 223 && buf[5] < 248 && buf.length === 6))
    ) {
        // unsigned char overflow.
        if (x < 0x20) x += 0xff;
        if (y < 0x20) y += 0xff;

        // Convert the coordinates into a
        // properly formatted x10 utf8 sequence.

        s =
            '\x1b[M' +
            String.fromCharCode(b) +
            String.fromCharCode(x) +
            String.fromCharCode(y);
    }

    if (
        b &&
        ((parts = /^\x1b\[M([\x00\u0020-\uffff]{3})/.exec(s)) ||
            /\x1b\[M/g.test(s))
    ) {
        // XTerm / X10
        b = parts ? parts[1].charCodeAt(0) : b;
        x = parts ? parts[1].charCodeAt(1) : null;
        y = parts ? parts[1].charCodeAt(2) : null;

        if (!b) {
            return;
        }

        if (parts && x && y) {
            if (this.lastKey1 === null) {
                this.lastKey1 = { x, y };
            } else {
                this.lastKey2 = { ...this.lastKey1 };

                this.lastKey1 = { x, y };
            }
        } else if (this.lastKey2) {
            if (!x) {
                deadcell = true;
                if (this.lastKey1.x > this.lastKey2.x) {
                    x = this.lastKey1.x + 1;
                } else if (this.lastKey1.x < this.lastKey2.x) {
                    x = this.lastKey1.x - 1;
                } else {
                    x = this.lastKey1.x;
                }
            }

            if (!y) {
                deadcell = true;
                if (this.lastKey1.y > this.lastKey2.y) {
                    y = this.lastKey1.y + 1;
                } else if (this.lastKey1.y < this.lastKey2.y) {
                    y = this.lastKey1.y - 1;
                } else {
                    y = this.lastKey1.y;
                }
            }
        }

        key.name = 'mouse';
        key.type = this.lastType || 'X10';

        key.raw = [b, x, y, parts ? parts[0] : s];
        key.buf = buf;
        key.x = x - 32;
        key.y = y - 32;

        if (this.zero) key.x--, key.y--;

        if (x === 0) key.x = 255;
        if (y === 0) key.y = 255;

        mod = b >> 2;
        key.shift = !!(mod & 1);
        key.meta = !!((mod >> 1) & 1);
        key.ctrl = !!((mod >> 2) & 1);

        b -= 32;

        key.b = b;

        if ((b >> 6) & 1) {
            key.action = b & 1 ? 'wheeldown' : 'wheelup';
            key.button = 'middle';
        } else if (b === 3 || b === 11 || b === 19) {
            //Added 11 and 19 - mouse up button code when alt and ctrl are held down

            this.mouseDown = false;

            key.action = 'mouseup';
            key.button = this._lastButton || 'unknown';
            delete this._lastButton;
        } else {
            key.action = 'mousedown';
            button = b & 3;
            key.button =
                button === 0
                    ? 'left'
                    : button === 1
                    ? 'middle'
                    : button === 2
                    ? 'right'
                    : 'unknown';

            if (
                key.button !== 'unknown' ||
                this._dragging ||
                !this._lastButton
            ) {
                this.mouseDown = true;
            }

            this._lastButton = key.button;
        }

        /*
                The following code implements 'mouse drag' events, switching the emitted action from mousedown to mousemove,
                and setting the 'dragging' flag to true

                Blessed doesn't differentiate between the differing 'button' (b) values for left, middle, right buttons
                that happen when dragging, which this code does.

                It also recognizes dragging while holding ctrl or alt with left/middle/right

                Absolutely zero idea how portable this all is. I'm developing in WSL2 (Debian),
                with TERM=xterm-256color.
           */

        if (
            this._lastButton &&
            !this.VTE &&
            [32, 33, 34, 48, 40, 50, 42, 49, 41].includes(b)
        ) {
            if (key.action === 'mousedown' && !this._dragging) {
                this._dragging = true;
                key.dragging = true; //'start';

                stream.emit('drag start', key);

                this._startX = key.x;
                this._startY = key.y;

                this._diffX = 0;
                this._diffY = 0;
            } else {
                key.dragging = this._dragging;
            }

            if (key.action === 'mousedown' && key.dragging) {
                this._diffX = key.x - this._startX;
                this._diffY = key.y - this._startY;

                key.action = 'mousemove';
            }

            if (b === 48 || b === 49 || b === 50) {
                key.ctrl = true;
            }

            if (b === 40 || b === 41 || b === 42) {
                key.meta = true;
            }

            if (b === 32 || b === 48 || b === 40) {
                key.dragButton = 'left';
            } else if (b === 33 || b === 41 || b === 49) {
                key.dragButton = 'middle';
            } else if (b === 34 || b === 50 || b === 42) {
                key.dragButton = 'right';
            }

            key.startX = this._startX;
            key.startY = this._startX;

            key.diffX = this._diffX;
            key.diffY = this._diffY;
        } else if (key.action === 'mouseup' && this._dragging) {
            key.startX = this._startX;
            key.startY = this._startX;

            key.diffX = this._diffX;
            key.diffY = this._diffY;

            key.dragging = false;

            stream.emit('drag stop', key);
        }

        if (
            b === 35 ||
            b === 39 ||
            b === 51 ||
            b === 43 ||
            (this.isVTE && (b === 32 || b === 36 || b === 48 || b === 40))
        ) {
            delete key.button;
            key.action = 'mousemove';
        }
    } else if ((parts = /^\x1b\[(\d+;\d+;\d+)M/.exec(s))) {
        // URxvt
        params = parts[1].split(';');
        b = +params[0];
        x = +params[1];
        y = +params[2];

        key.name = 'mouse';
        key.type = 'urxvt';

        key.raw = [b, x, y, parts[0]];
        key.buf = buf;
        key.x = x;
        key.y = y;

        if (this.zero) key.x--, key.y--;

        mod = b >> 2;
        key.shift = !!(mod & 1);
        key.meta = !!((mod >> 1) & 1);
        key.ctrl = !!((mod >> 2) & 1);

        // XXX Bug in urxvt after wheelup/down on mousemove
        // NOTE: This may be different than 128/129 depending
        // on mod keys.
        if (b === 128 || b === 129) {
            b = 67;
        }

        b -= 32;
        key.b = b;
        if ((b >> 6) & 1) {
            key.action = b & 1 ? 'wheeldown' : 'wheelup';
            key.button = 'middle';
        } else if (b === 3) {
            // NOTE: x10 and urxvt have no way
            // of telling which button mouseup used.
            key.action = 'mouseup';
            key.button = this._lastButton || 'unknown';
            delete this._lastButton;
        } else {
            key.action = 'mousedown';
            button = b & 3;
            key.button =
                button === 0
                    ? 'left'
                    : button === 1
                    ? 'middle'
                    : button === 2
                    ? 'right'
                    : 'unknown';
            // NOTE: 0/32 = mousemove, 32/64 = mousemove with left down
            // if ((b >> 1) === 32)
            this._lastButton = key.button;
        }

        // Probably a movement.
        // The *newer* VTE gets mouse movements comepletely wrong.
        // This presents a problem: older versions of VTE that get it right might
        // be confused by the second conditional in the if statement.
        // NOTE: Possibly just switch back to the if statement below.
        // none, shift, ctrl, alt
        // urxvt: 35, _, _, _
        // gnome: 32, 36, 48, 40
        // if (key.action === 'mousedown' && key.button === 'unknown') {
        if (
            b === 35 ||
            b === 39 ||
            b === 51 ||
            b === 43 ||
            (this.isVTE && (b === 32 || b === 36 || b === 48 || b === 40))
        ) {
            delete key.button;
            key.action = 'mousemove';
        }

        //   self.emit('mouse', key);

        //  return;
    } else if ((parts = /^\x1b\[<(\d+;\d+;\d+)([mM])/.exec(s))) {
        // SGR
        down = parts[2] === 'M';
        params = parts[1].split(';');
        b = +params[0];
        x = +params[1];
        y = +params[2];

        key.name = 'mouse';
        key.type = 'sgr';

        key.raw = [b, x, y, parts[0]];
        key.buf = buf;
        key.x = x;
        key.y = y;

        if (this.zero) key.x--, key.y--;

        mod = b >> 2;
        key.shift = !!(mod & 1);
        key.meta = !!((mod >> 1) & 1);
        key.ctrl = !!((mod >> 2) & 1);

        key.b = b;

        if ((b >> 6) & 1) {
            key.action = b & 1 ? 'wheeldown' : 'wheelup';
            key.button = 'middle';
        } else {
            key.action = down ? 'mousedown' : 'mouseup';
            button = b & 3;
            key.button =
                button === 0
                    ? 'left'
                    : button === 1
                    ? 'middle'
                    : button === 2
                    ? 'right'
                    : 'unknown';
        }

        // Probably a movement.
        // The *newer* VTE gets mouse movements comepletely wrong.
        // This presents a problem: older versions of VTE that get it right might
        // be confused by the second conditional in the if statement.
        // NOTE: Possibly just switch back to the if statement below.
        // none, shift, ctrl, alt
        // xterm: 35, _, 51, _
        // gnome: 32, 36, 48, 40
        // if (key.action === 'mousedown' && key.button === 'unknown') {
        if (
            b === 35 ||
            b === 39 ||
            b === 51 ||
            b === 43 ||
            (this.isVTE && (b === 32 || b === 36 || b === 48 || b === 40))
        ) {
            delete key.button;
            key.action = 'mousemove';
        }

        //   self.emit('mouse', key);

        // return;
    } else if ((parts = /^\x1b\[<(\d+;\d+;\d+;\d+)&w/.exec(s))) {
        // DEC
        // The xterm mouse documentation says there is a
        // `<` prefix, the DECRQLP says there is no prefix.
        params = parts[1].split(';');
        b = +params[0];
        x = +params[1];
        y = +params[2];
        page = +params[3];

        key.name = 'mouse';
        key.type = 'dec';

        key.raw = [b, x, y, parts[0]];
        key.buf = buf;
        key.x = x;
        key.y = y;
        key.page = page;

        if (this.zero) key.x--, key.y--;

        key.action = b === 3 ? 'mouseup' : 'mousedown';

        key.b = b;

        key.button =
            b === 2
                ? 'left'
                : b === 4
                ? 'middle'
                : b === 6
                ? 'right'
                : 'unknown';

        //  self.emit('mouse', key);

        //        return;
    } else if ((parts = /^\x1b\[24([0135])~\[(\d+),(\d+)\]\r/.exec(s))) {
        // vt300
        b = +parts[1];
        x = +parts[2];
        y = +parts[3];

        key.name = 'mouse';
        key.type = 'vt300';

        key.raw = [b, x, y, parts[0]];
        key.buf = buf;
        key.x = x;
        key.y = y;

        if (this.zero) key.x--, key.y--;

        key.action = 'mousedown';
        key.button =
            b === 1
                ? 'left'
                : b === 2
                ? 'middle'
                : b === 5
                ? 'right'
                : 'unknown';

        //    self.emit('mouse', key);
        key.b = b;

        //  return;
    } else if ((parts = /^\x1b\[(O|I)/.exec(s))) {
        key.action = parts[1] === 'I' ? 'focus' : 'blur';

        stream.emit('mouse', key);
        stream.emit(key.action);

        return;
    }

    this.lastKeys = this.lastKeys || [];

    if (key.action) {
        //this.debug(key, true);

        /*
            Double-clicking and triple clicking
        */

        if (!deadcell) {
            this.mouseX = key.x;
            this.mouseY = key.y;
        }

        if (['wheelup', 'wheeldown'].includes(key.action)) {
            this.detail = 1;
        } else if (this.detail < 3 && ['mousedown'].includes(key.action)) {
            if (this.lastT) {
                const elapsed = key.timeStamp - this.lastT;

                if (elapsed > 200) {
                    this.detail = 1;
                } else {
                    this.detail++;
                }
            }

            key.detail = this.detail;

            if (this.detail === 2) {
                stream.emit('double-click', key);
                setTimeout(() => {
                    this.detail = 1;
                }, 500);
            } else if (this.detail === 3) {
                stream.emit('triple-click', key);
                this.detail = 1;
            }

            this.lastT = key.timeStamp;
        }

        stream.emit('mouse', key);

        if (
            ['wheeldown', 'wheelup', 'mouseup', 'mousedown'].includes(
                key.action
            )
        ) {
            if (this._dragging) {
                this._stopDragging = true;
                this._dragging = false;
            }
        }
    }
};
