const debounce = require('lodash.debounce');
const { getMouseEvent } = require('../util/xtermMouse');
const clipboardy = require('clipboardy');

class TerminalEvents {
    initializer() {
        this.initTerminalStateEvents();
        this.initTerminalKeyEvents();
        this.initTermMouseEvents();
    }

    initTermMouseEvents() {
        this.key('escape', () => {
            if (this._mouseSelecting) {
                this.clearSelection();
                this.screen.render();
            }
        });

        this.key('C-c', () => {
            if (this.term && this.term.hasSelection() && this.mouseSelecting) {
                try {
                    clipboardy.writeSync(this.selectionText.trimRight());
                } catch {}
            }
        });

        this.on('click', (data) => {
            if (
                data.button === 'right' &&
                this.onCommandLine &&
                this.writable
            ) {
                try {
                    this.pty.write(clipboardy.readSync());
                } catch {}
            }
        });

        this.on('mousedown', (data) => {
            if (!this.doMouseScroll()) {
                return;
            }

            if (this._scrollingBar) {
                // Do not allow dragging on the scrollbar:
                delete this.screen._dragging;
                delete this._drag;
                return;
            }
            var x = data.x - this.aleft;
            var y = data.y - this.atop + 1;
            if (x === this.width - this.iright - 1) {
                // Do not allow dragging on the scrollbar:
                delete this.screen._dragging;
                delete this._drag;
                var perc = (y - this.itop) / (this.height - this.iheight);
                this.setScrollPerc((perc * 100) | 0);
                var smd, smu;
                this._scrollingBar = true;
                this.selectionService.disable();
                this.onScreenEvent(
                    'mousemove',
                    (smd = (data) => {
                        if (data.dragging) {
                            var y = data.y - this.atop + 1;
                            var perc = y / this.height;
                            this.setScrollPerc((perc * 100) | 0);
                        }
                    })
                );
                // If mouseup occurs out of the window, no mouseup event fires, and
                // scrollbar will drag again on mousedown until another mouseup
                // occurs.
                this.onScreenEvent(
                    'mouseup',
                    (smu = () => {
                        this.selectionService.enable();
                        this._scrollingBar = false;
                        this.removeScreenEvent('mousemove', smd);
                        this.removeScreenEvent('mouseup', smu);
                    })
                );
            }
        });

        this.on(
            'wheeldown',
            debounce(
                () => {
                    if (!this.doMouseScroll()) {
                        return;
                    }

                    this.scroll(this.wheelAmount);
                },
                5,
                { treailing: true, leading: true }
            )
        );

        this.on(
            'wheelup',
            debounce(
                () => {
                    if (!this.doMouseScroll()) {
                        return;
                    }

                    this.scroll(-this.wheelAmount);
                },
                5,
                { treailing: true, leading: true }
            )
        );

        if (
            this.options.termType === 'program' ||
            this.options.termType === 'shell'
        ) {
            ['wheelup', 'wheeldown', 'mouseup', 'mousedown'].forEach((ev) => {
                this.on(ev, this.onMouse.bind(this));
            });
        }
    }

    onMouse(key) {
        if (
            this.options.doOnMouse === false ||
            (typeof this.options.doOnMouse === 'function' &&
                this.options.doOnMouse(this) === false)
        ) {
            return;
        }

        if (
            this.hidden ||
            this.screen.focused !== this ||
            (this.muteStream && this.muteStream.muted) ||
            !this.ready ||
            !this.shellProgram
        ) {
            return;
        }

        const { button, action, x, y } = key;

        if (button === 'unknown') {
            if (!!this.lastButton) {
                key.button = this.lastButton;
            }
        } else if (action === 'mousedown') {
            this.lastButton = button;
        }

        const { row, col } = this.blessedToXterm(y, x);

        key.row = row;
        key.col = col;

        const xtermEvent = getMouseEvent(key);

        this.term._core._coreMouseService.triggerMouseEvent(xtermEvent);

        this.termRender(null, true);
    }

    initTerminalStateEvents() {
        this.on('resize', this.debouncedResize);

        this.on('attach', () => {
            this.lastParent = this.parent;

            this.resize(true);

            this.firstAttach = false;
        });

        this.once('render', () => {
            this.resize(true);
        });

        this.on('focus', () => {
            if (!this.parent || !this.term) {
                return;
            }

            this.wheelAmount = 1;

            try {
                if (this.maximized && !this.panelGrid) {
                    this.wheelAmount = 2;
                }
            } catch {}

            if (this.resizeOnFocus) {
                this.resizeOnFocus = false;
                this.preResize();
                setTimeout(() => {
                    this.resize(true);
                });
            }

            if (this.options.termType === 'process' && this.hidden) {
                process.nextTick(() => {
                    this.show();
                });
            }

            this.screen.grabKeys = false;

            if (this.onFocusEvent) {
                this.onFocusEvent(this);
            }

            setTimeout(() => {
                if (this.screen.focused === this && this.search) {
                    this.search.enable();
                }
            }, 250);
        });

        this.on('blur', () => {
            if (!this.parent || !this.term) {
                return;
            }

            this.refresh = true;

            setTimeout(() => {
                if (this.mouseSelecting && !this.focused) {
                    this.clearSelection();
                }
            });

            if (this.options.showConsoleCursor) {
                this.hideCursor();

                setTimeout(() => {
                    if (this.screen.focused === this) {
                        this.showCursor();
                    }
                }, 500);
            }

            if (this.onBlurEvent) {
                this.onBlurEvent(this);
            }
        });

        this.on('terminal state', (state, change, active) => {
            this.onTerminalState(state, change, active);
            this.termRender(true);
        });

        this.on('destroy', () => {
            if (this.onDestroy) {
                this.onDestroy(this);
            }

            if (this.options.showConsoleCursor) {
                this.hideCursor();
            }

            this.persisting = false;
            this.dispose(true);
        });
    }

    initTerminalKeyEvents() {
        const debDelay = 5;
        const shortScroll = 1;
        const fastScroll = 4;

        this.shortScroll = shortScroll;
        this.fastScroll = fastScroll;

        this.key(
            'down',
            debounce(
                () => {
                    if (this.doKeyScroll('down')) {
                        this.scroll(shortScroll);
                    }
                },
                debDelay,
                { trailing: true, leading: true }
            )
        );

        this.key(
            'up',
            debounce(
                () => {
                    if (this.doKeyScroll('up')) {
                        this.scroll(shortScroll * -1);
                    }
                },
                debDelay,
                { trailing: true, leading: true }
            )
        );

        this.key(
            'S-down',
            debounce(
                () => {
                    if (this.doKeyScroll('down')) {
                        this.scroll(fastScroll, true);
                    }
                },
                debDelay,
                { trailing: true, leading: true }
            )
        );

        this.key(
            'S-up',
            debounce(
                () => {
                    if (this.doKeyScroll('up')) {
                        this.scroll(fastScroll * -1, true);
                    }
                },
                debDelay,
                { trailing: true, leading: true }
            )
        );

        this.key('home', () => {
            if (this.doKeyScroll('home')) {
                this.setScrollPerc(0);
            }
        });

        this.key('end', () => {
            if (this.doKeyScroll('end')) {
                this.setScrollPerc(100);
            }
        });

        this.key('pageup', (ch, key) => {
            if (!key) {
                return;
            }
            if (this.doKeyScroll(key.full)) {
                if (this.shell && this.options.shellType === 'repl') {
                    this.scroll(this.shortScroll * -1);
                } else {
                    this.scroll((this.rows - 2) * -1);
                }
            }
        });

        this.key('pagedown', (ch, key) => {
            if (!key) {
                return;
            }
            if (this.doKeyScroll(key.full)) {
                if (this.shell && this.options.shellType === 'repl') {
                    this.scroll(this.shortScroll);
                } else {
                    this.scroll(this.rows - 2);
                }
            }
        });

        this.key('C-l', () => {
            if (
                this.options.termType === 'process' ||
                this.options.termType === 'base'
            ) {
                this.clear();
            }
        });

        this.runningAction = false;

        if (this.options.actions) {
            this.on('keypress', async (ch, key) => {
                if (
                    this.focused &&
                    this.options.actions[key.full] &&
                    !this.runningAction
                ) {
                    this.runningAction = true;
                    await this.options.actions[key.full](this);
                    this.runningAction = false;
                }
            });
        }
    }

    onTerminalState(state, change, active) {
        if (this.options.termType === 'markdown') {
            return;
        }

        if (state.id === this.id) {
            this.active = active;
            if (this.options.termType !== 'process') {
                if (
                    !active &&
                    !this.disposed &&
                    !this.destroyed &&
                    !this.restarting
                ) {
                    this.skipData = false;

                    if (this.screen.userClose) {
                        this.closing = true;
                        this.emit('destroy');
                    } else {
                        if (this.persisting) {
                            this.dispose(false);
                        } else {
                            this.closing = true;
                            this.setLabel('Closing');
                            setTimeout(() => {
                                this.emit('destroy');
                            }, 1000);
                        }
                    }
                }
            }
        } else if (this.watchTerm && state.id === this.watchTerm) {
            if (change === 'restarted' && !this.restarting) {
                this.skipData = false;

                if (this.term) {
                    this.clear({ all: true });
                    this.term.write('Restarting');
                    this.screen.render();
                }

                this.restarting = true;

                setTimeout(() => {
                    this.activated = false;
                    this.activate();
                    this.restarting = false;
                    this.setLabel(this.options.label);
                }, 1000);
            }
        }
    }

    doMouseSelection() {
        if (this.screen.focused !== this || this.hidden) {
            return false;
        }

        if (this._doMouseSelection === true) {
            return true;
        }

        if (!this.inactiveOk) {
            if (this.muteStream && this.muteStream.muted) {
                return false;
            }

            if (this.options.termType === 'program' || this.shellProgram) {
                return false;
            }
        }

        return true;
    }

    doMouseScroll() {
        if (this.screen.focused !== this || this.hidden) {
            return false;
        }

        if (this._doMouseScroll === true) {
            return true;
        }

        if (!this.inactiveOk) {
            if (this.muteStream && this.muteStream.muted) {
                return false;
            }

            if (this.options.termType === 'program' || this.shellProgram) {
                return false;
            }
        }

        return true;
    }

    doKeyScroll(full) {
        if (!full) {
            return;
        }

        full = full.full ? String(full.full) : String(full);

        if (!this.shell || this.doShellKeyScroll(full)) {
            return true;
        } else if (
            (this.pty && !this.active && !this.writable) ||
            this.options.shellType === 'script'
        ) {
            return true;
        }

        return false;
    }

    doShellKeyScroll(full) {
        full = String(full);

        if (this.options.shellType !== 'script') {
            return true;
        }

        if (this.shellProgram || !full) {
            return false;
        }

        if (full && (full === 'pageup' || full === 'pagedown')) {
            if (this.options.shellType === 'repl') {
                return true;
            }

            return false;
        }

        if (full && (full.includes('pagedown') || full.includes('pageup'))) {
            return true;
        }

        return false;
    }
}

module.exports = TerminalEvents;
