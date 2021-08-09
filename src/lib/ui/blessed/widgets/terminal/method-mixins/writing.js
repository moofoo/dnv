const { Buffer } = require('buffer');
const stripAnsi = require('strip-ansi');

const CALLBACK_BYTE_LIMIT = 100000;
const HIGH = 50;
const LOW = 5;
class TerminalWriting {
    initializer() {
        this.bufferedData = [];
        this._freeze = false;
    }

    get freeze() {
        return this._freeze;
    }

    set freeze(value) {
        if (this._freeze && value === false) {
            this._freeze = value;
            if (this.bufferedData.length) {
                let x = 0;
                while (this.bufferedData.length) {
                    const line = this.bufferedData.shift();
                    if (
                        (x < 2 && line !== '') ||
                        (x > 2 && line.trim() !== '')
                    ) {
                        this.write(!line.includes('\n') ? line + '\n' : line);
                    }
                }
                this.refresh = true;
            }
        }
        this._freeze = value;
    }

    preWrite(data) {
        if (!this.term || data === undefined || data === null) {
            return false;
        }

        if (Buffer.isBuffer(data)) {
            data = data.toString('utf-8');
        } else if (typeof data === 'object') {
            if (this.options.prettyprint) {
                data = JSON.stringify(data, null, 4);
            } else {
                data = JSON.stringify(data);
            }
        }

        if (this.formatter) {
            data = this.formatter(data, this);
        }

        if (data === '') {
            return false;
        }

        let newlines;

        if (this.freeze) {
            newlines = data.split('\n');
            newlines.forEach((line) => {
                this.bufferedData.push(line);

                if (
                    this.options.scrollback &&
                    this.bufferedData.length > this.options.scrollback
                ) {
                    this.bufferedData.shift();
                }
            });

            return false;
        }

        const ignore = this.ignoreTest(data);

        if (ignore) {
            return true;
        }

        if (this.filtering) {
            return data;
        }

        if (this._filterTerm && this.filter && this.filter !== '') {
            newlines = data.split('\n');
            let match = false;

            for (const line of newlines) {
                const trimmed = stripAnsi(line).trim();
                if (line.length) {
                    if (RegExp(this.filter, 'gi').test(trimmed)) {
                        match = true;
                    }
                }
            }

            if (match) {
                this._filterTerm.write(data);
            }
        }

        return data;
    }

    write(data, cb) {
        data = this.preWrite(data);

        if (typeof data === 'boolean') {
            return data;
        }

        if (data) {
            if (this.shell && this.ready && this.active) {
                if (data.includes('\u001B[?25h')) {
                    this.options.hideCursor = false;
                } else if (data.includes('\u001B[?25l')) {
                    this.options.hideCursor = true;
                }
            }

            this.writeflow(data, () => {
                if (cb) {
                    cb(data);
                }

                if (this.ready) {
                    this.emit('term write', data, this.term);
                }
            });

            return true;
        }

        return false;
    }

    writeflow(data, cb) {
        this.written = this.written === undefined ? 0 : this.written;

        this.pendingCallbacks =
            this.pendingCallbacks === undefined ? 0 : this.pendingCallbacks;

        this.written += data.length;

        if (this.written > CALLBACK_BYTE_LIMIT) {
            this.term.write(data, () => {
                if (cb) {
                    cb(data);
                }

                this.pendingCallbacks = Math.max(this.pendingCallbacks - 1, 0);
                if (this.pendingCallbacks < LOW) {
                    if (this.shell) {
                        this.pty.flowResume();
                    } else if (this.options.termType === 'process') {
                        this.execStream.resume();
                    }
                }
            });

            this.pendingCallbacks++;

            this.written = 0;

            if (this.pendingCallbacks > HIGH) {
                if (this.shell) {
                    this.pty.flowPause();
                } else if (this.options.termType === 'process') {
                    this.execStream.pause();
                }
            }
        } else {
            this.term.write(data, () => {
                if (cb) {
                    cb(data);
                }
            });
        }
    }

    writeln(data) {
        if (!this.term || data === undefined || data === null) {
            return false;
        }

        if (Buffer.isBuffer(data)) {
            data = data.toString('utf-8');
        } else if (typeof data === 'object') {
            data = JSON.stringify(data);
        }

        this.term.writeln(data);
    }

    ignoreTest(data) {
        if (this.options.ignore) {
            if (typeof this.options.ignore === 'string') {
                for (const line of stripAnsi(data).split('\n')) {
                    if (RegExp(this.options.ignore, 'gi').test(line)) {
                        return true;
                    }
                }
            } else if (Array.isArray(this.options.ignore)) {
                for (const line of stripAnsi(data).split('\n')) {
                    for (const ign of this.options.ignore) {
                        if (RegExp(ign, 'gi').test(line)) {
                            return true;
                        }
                    }
                }
            } else if (typeof this.options.ignore === 'function') {
                if (!this.options.ignore(data)) {
                    return true;
                }
            }
        }
    }
}

module.exports = TerminalWriting;
