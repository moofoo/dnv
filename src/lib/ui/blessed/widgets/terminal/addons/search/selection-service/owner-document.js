/*
    Replacement for the instance._screenElement.ownerDocument object, since we're not in a browser environment.
    This communicates terminal mouse events emitted by Blessed to the XTerm selection service and does some DNV UI specific logic.
*/

class OwnerDocument {
    constructor(blessedTerm, selectionService) {
        this.selectionService = selectionService;

        this.blessedTerm = blessedTerm;

        this.screen = this.blessedTerm.screen;

        this.debug = this.debug.bind(this);

        this.functions = {};

        this.listening = [];
    }

    get onCommandLine() {
        return this.blessedTerm.onCommandLine;
    }

    get shellProgram() {
        return this.blessedTerm.shellProgram;
    }

    get mouseDown() {
        return this.screen.program.mouseDown;
    }

    render() {
        this.blessedTerm.termRender(null, true);
    }

    onMouse(eventName, fn, key) {
        if (
            !this ||
            !this.blessedTerm ||
            !this.blessedTerm.parent ||
            this.blessedTerm.popover ||
            this.blessedTerm.hidden ||
            this.blessedTerm.searchActive ||
            this.blessedTerm.promptOpen
        ) {
            return;
        }

        const ev = this.getDOMishEvent(key);

        if (eventName === 'mousedown') {
            if (this.blessedTerm.isInside(key.x, key.y)) {
                fn(ev);
            } else {
                this.selectionService.clearSelection();
                this.render();
            }
        } else {
            fn(ev);
        }
    }

    removeEvents() {
        for (const [key, fn] of Object.entries(this.functions)) {
            if (fn) {
                this.screen.off(key, fn);
                this.functions[key] = null;
            }
        }
    }

    scroll(offset) {
        this.blessedTerm.scroll(offset);
    }

    getScroll() {
        return this.blessedTerm.getScroll();
    }

    getDOMishEvent(key) {
        let button;

        switch (key.button) {
            case 'left':
                button = 0;
                break;
            case 'middle':
                button = 1;
                break;
            case 'right':
                button = 2;
                break;
            default:
                button = 0;
        }

        const clientX = key.x;
        const clientY = key.y;

        let {
            ctrl: ctrlKey,
            meta: altKey,
            shift: shiftKey,
            timeStamp,
            detail,
            dragging,
        } = key;

        if (ctrlKey) {
            altKey = false;
        }

        const inside = this.blessedTerm.isInside(key.x, key.y);
        let offset = 0;
        const pos = this.blessedTerm.dimensions;

        if (pos) {
            if (clientY >= this.screen.height) {
                offset = 3;
            } else if (clientY >= this.screen.height - 1) {
                offset = 2;
            } else if (clientY > pos.bottom) {
                offset = clientY - pos.bottom;
            } else if (clientY < pos.top) {
                offset = pos.top - clientY;
            }

            if (offset >= 9) {
                offset = 5;
            } else if (offset >= 7) {
                offset = 4;
            } else if (offset >= 5) {
                offset = 3;
            } else if (offset >= 3) {
                offset = 2;
            } else if (offset >= 1) {
                offset = 1;
            }

            if (clientY < pos.top) {
                offset *= -1;
            }
        }

        return {
            key: { ...key },
            ctrlKey,
            altKey,
            shiftKey,
            button,
            clientX,
            clientY,
            detail,
            timeStamp,
            dragging,
            offset,
            inside,
        };
    }

    get key() {
        if (this.blessedTerm.options.itemKey === 'main') {
            return this.blessedTerm.options.key;
        }

        return this.blessedTerm.options.itemKey || this.blessedTerm.options.key;
    }

    debug(txt, clear, diff) {
        if (this.blessedTerm && this.blessedTerm.parent) {
            this.blessedTerm.parent.debug(txt, clear, diff);
        }
    }

    get doAltClick() {
        return (
            this.blessedTerm.writable &&
            this.blessedTerm.shell &&
            this.blessedTerm.options.shellType !== 'script'
        );
    }

    onAltClick(sequence) {
        if (sequence && sequence.length) {
            this.blessedTerm.coreService.triggerBinaryEvent(sequence);
        }
    }

    on(eventName, fn) {
        this.addEventListener(eventName, fn);
    }

    off(eventName, fn) {
        this.removeEventListener(eventName, fn);
    }

    addEventListener(eventName, fn, force = false) {
        if (
            !force &&
            (!this ||
                !this.blessedTerm ||
                !this.blessedTerm.parent ||
                this.blessedTerm.popover ||
                this.blessedTerm.hidden ||
                this.blessedTerm.searchActive)
        ) {
            return false;
        }

        if (
            this.selectionService._enabled &&
            !this.listening.includes(eventName)
        ) {
            this.listening.push(eventName);

            const func =
                this.functions[eventName] ||
                this.onMouse.bind(this, eventName, fn);

            if (!this.functions[eventName]) {
                this.functions[eventName] = func;
            }

            this.screen.on(eventName, func);

            return true;
        }

        return false;
    }

    removeEventListener(eventName) {
        if (this.listening.includes(eventName)) {
            this.listening = this.listening.filter((l) => l !== eventName);
            const fn = this.functions[eventName];

            if (fn) {
                this.screen.off(eventName, fn);
            }
        }
    }
}

module.exports = OwnerDocument;
