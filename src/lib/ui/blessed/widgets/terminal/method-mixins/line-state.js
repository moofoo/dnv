const { Buffer } = require('buffer');
const stripAnsi = require('strip-ansi');

class LineState {
    initializer(opts = {}) {
        if (opts.lineState) {
            this.initLineState();

            this.on('term write', (data) => {
                if (
                    data &&
                    !this.disposed &&
                    !this.filtering &&
                    !this.freeze &&
                    !this.filter &&
                    !this.searchActive &&
                    !this.startingUp &&
                    !this.skipData
                ) {
                    if (Buffer.isBuffer(data)) {
                        data = data.toString('utf-8');
                    }

                    this.updateLineState(stripAnsi(data));
                }
            });
        }
    }

    initLineState() {
        if (this.lineState) {
            return;
        }

        this.lineState = {};

        for (const [name, ls] of Object.entries(this.options.lineState || {})) {
            if (ls.default !== undefined) {
                this.lineState[name] = ls.default;
            } else if (ls.noState !== true) {
                this.lineState[name] = false;
            }

            if (ls.fn) {
                this.options.lineState[name] = ls.fn;
            }
        }
    }

    updateLineState(line) {
        this.lineState = this.lineState || {};

        const oldState = { ...this.lineState };

        let diff = false;

        for (const [name, ls] of Object.entries(this.options.lineState || {})) {
            if (typeof ls === 'function') {
                const result = ls(line, this.lineState, this);
                if (result !== undefined) {
                    this.lineState[name] = result;
                }
            } else if (typeof ls === 'object' && ls.on && ls.off) {
                let isOff = false;

                if (this.lineState[name]) {
                    if (typeof ls.off === 'string') {
                        if (RegExp(`${ls.off}`, 'gi').test(line)) {
                            this.lineState[name] = false;
                            isOff = true;
                        }
                    } else if (Array.isArray(ls.off)) {
                        ls.off.forEach((test) => {
                            if (RegExp(`${test}`, 'gi').test(line)) {
                                this.lineState[name] = false;
                                isOff = true;
                            }
                        });
                    }
                }

                if (!isOff) {
                    if (typeof ls.on === 'string') {
                        if (RegExp(`${ls.on}`, 'gi').test(line)) {
                            this.lineState[name] = true;
                        }
                    } else if (Array.isArray(ls.on)) {
                        ls.on.forEach((test) => {
                            if (RegExp(`${test}`, 'gi').test(line)) {
                                this.lineState[name] = true;
                            }
                        });
                    }
                }
            }

            if (oldState[name] !== this.lineState[name]) {
                diff = true;
            }
        }

        if (diff) {
            this.lineStateChange(oldState);
        }
    }

    lineStateChange(oldState = {}) {
        this.emit('line state', this, this.lineState, oldState);

        if (this.parent) {
            this.parent.emit('line state', this, this.lineState, oldState);
        }
    }
}

module.exports = LineState;
