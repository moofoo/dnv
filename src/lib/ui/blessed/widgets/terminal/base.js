const blessed = require('blessed');
const debounce = require('lodash.debounce');

const merge = require('lodash.merge');
const cloneDeep = require('lodash.clonedeep');

require('./util/window');
const Terminal = require('xterm').Terminal;
const { Unicode11Addon } = require('xterm-addon-unicode11');
const SearchAddon = require('./addons/search');

const UI = require('../../layouts/ui');

class XTerminal extends blessed.ScrollableBox {
    static type = 'terminal';

    static defaults = {
        termName: 'xterm-256color',
        cwd: process.cwd(),
        termType: 'process',
        pty: false,
        watchTerm: null,
        args: [],
        hideCursor: true,
        showConsoleCursor: false,
        prettyprint: true,
        interactive: false,
        scrollback: 1000,
        scrollable: true,
        alwaysScroll: true,
        clickable: false,
        mouse: false,
        grabMouse: false,
        mouseFocus: true,
        full: true,
        border: {
            type: 'round',
            fg: 'white',
            bg: -1,
        },
        scrollbar: {
            ch: ' ',
            style: { bg: 15 },
            track: {
                style: { bg: 242 },
            },
        },
        style: {
            fg: 15,
            bg: 0,
        },
    };

    constructor(opts = {}) {
        let options;

        if (!opts.defaultsApplied) {
            options = merge({}, opts, XTerminal.defaults, opts);
        } else {
            options = { ...opts };
        }

        options.style = cloneDeep(options.style);
        options.border =
            opts.border !== null ? cloneDeep(options.border) : null;
        options.scrollbar =
            opts.scrollbar !== null ? cloneDeep(options.scrollbar) : null;

        if (options.termType === 'program' && options.shellType !== 'script') {
            options.scrollable = false;
            options.alwaysScroll = false;
        }

        super(options);

        this.options.sendFocus = true;
        this.options.autoFocus = false;
        this.options.mouseFocus = true;
        this.options.mouse = true;
        this.options.clickable = true;
        this.mouse = true;
        this.clickable = true;

        this.ready = true;
        this.active = true;

        this.enableMouse();

        this.ready = false;
        this.active = false;
        this.rendered = false;
        this.disposed = false;
        this.destroyed = false;
        this.clearBufferCache = false;
        this.skipData = false;
        this._mouseSelecting = false;
        this.firstAttach = true;
        this.persisting = true;
        this.newItem = true;
        this.startingUp = false;
        this.refresh = false;

        this.watchTerm = this.options.watchTerm;

        this.scrollable =
            this.options.termType !== 'program' ||
            this.options.shellType === 'script';

        this.alwaysScroll =
            this.options.termType !== 'program' ||
            this.options.shellType === 'script';

        this._cursorX = null;
        this._cursorY = null;

        this._foundPrompt = false;

        this.cursorLine = -1;

        if (this.options.format) {
            this.formatter = this.options.format.bind(this);
        }

        this.inputActions = options.inputAction;

        this.options.env = {
            TERM: 'xterm-256color',
            ...process.env,
        };

        this.options.cursorStyle =
            this.options.cursorStyle !== undefined
                ? this.options.cursorStyle
                : this.screen.options.cursor.shape;

        this.options.hideCursor =
            this.options.hideCursor !== undefined
                ? this.options.hideCursor
                : ['shell', 'program'].includes(this.options.termType)
                ? false
                : true;

        this.options.scrollback = this.options.scrollback
            ? Number(this.options.scrollback)
            : this.options.scrollback;

        this.panelGrid = this.options.panelGrid;

        if (!this.id && this.options.id) {
            this.id = this.options.id;
        }

        this.createTerm();

        this.debouncedResize = debounce(this.resize.bind(this), 100, {
            leading: false,
            trailing: true,
        });

        this.screenIgnoreLocked = [...this.screen.defIgnoreLocked];

        if (this.options.onFocus) {
            this.onFocusEvent = this.options.onFocus.bind(this);
        }

        if (this.options.onBlur) {
            this.onBlurEvent = this.options.onBlur.bind(this);
        }

        if (this.options.onReady) {
            this.onReady = this.options.onReady.bind(this);
        }

        if (this.options.onDestroy) {
            this.onDestroy = this.options.onDestroy.bind(this);
        }

        if (this.options.events) {
            for (const [name, fn] of Object.entries(this.options.events)) {
                this.on(name, fn.bind(this));
            }
        }

        this.hideCursor = UI.hideCursor;
        this.showCursor = UI.showCursor;

        this.removeAllListeners('render');
        this.removeAllListeners('attach');
        this.removeAllListeners('resize');
    }

    get clickable() {
        if (this.ready) {
            return this._clickable;
        }

        return false;
    }

    set clickable(value) {
        this._clickable = value;
    }

    get wheelAmount() {
        if (this.maximized && !this.panelGrid) {
            return 2;
        }

        return 1;
    }

    get mouseSelecting() {
        return this._mouseSelecting;
    }

    set mouseSelecting(value) {
        this._mouseSelecting = value;
    }

    get term() {
        if (this.filter || this.stayFiltered) {
            return this._filterTerm;
        }

        return this._term;
    }

    get selectionService() {
        if (this.term) {
            if ((this.filter || this.stayFiltered) && this._filterSearch) {
                return this._filterSearch;
            } else {
                return this._search;
            }
        }

        return null;
    }

    get selectionText() {
        if (this.term && this.selectionService) {
            return this.selectionService.selectionText;
        }

        return '';
    }

    get type() {
        return 'scrollable-box';
    }

    get uiType() {
        'terminal';
    }

    async activate() {
        if (this.activated) {
            return;
        }

        if (this.parent || this.restarting) {
            if (!this.term) {
                this.createTerm();
            }

            if (this.options.pty) {
                this.createPty();
            } else if (!this.shell && this.options.command) {
                this.execCommand();
            }

            if (this.activateNext) {
                await this.activateNext();
            }

            this.activated = true;

            this.termRender(false, true);
        }

        setTimeout(() => {
            if (this) {
                this.firstAttach = false;
                this.newItem = false;
            }
        }, 1500);
    }

    debug(txt) {
        if (this.parent) {
            this.parent.debug(txt);
        }
    }

    createTerm() {
        this._term = new Terminal({
            name: 'xterm-256color',
            allowTransparency: true,
            convertEol: ['process', 'markdown', 'base'].includes(
                this.options.termType
            )
                ? true
                : this.options.convertEol || false,
            cols: this.cols,
            rows: this.rows,
            scrollback: this.options.scrollback,
            drawBoldTextInBrightColors: false,
        });

        this._term._core._inputHandler._parser.setErrorHandler(() => ({
            abort: false,
        }));

        //this._term._core._inputHandler
        /*
            .parent -> is the terminal detached?

            .filter -> is filtering active? (is the alternate Xterm instance (this._filterTerm) currently rendering instead of this._term)

            .startingUp -> 'process'-type terminals have an optional 'prep' stage to load data (with .startingUp = true while loading).
                           This prevents rendering until the prep is finished.
                           The issue is that we don't want to write a single 1000-line chunk of text to XTerm, because it messes up
                           searching/selection and filtering (XTerm search will treat that chunk as a single line).
                           So, we have to let XTerm write the individual lines for them to be treated as such.
                           However, writing (and rendering ) 1000 lines takes...minutes to complete.

                           Solution: disable the term refresh -> blessed rendering behavior when "starting up"

                           Note that disabling scrolling (and related screen.render calls) during this 'prep' phase is important, too.

            .skipData ->  What blessed renders for the Terminal becomes very distorted, temporarily, when pty.resize and term.resize
                          are called. It looks kinda cool, but it's jarring if you're not expecting it.
                          'shell'/'program' type terminals use the .skipData flag to disable pty/xterm onData
                          events, blessed rendering and scrolling while resizing.

            .userClose -> indicates that the user has closed a 'shell' or 'program'-type terminal with Ctrl-Z/D.
        */
        this._term._core.refresh = () => {
            if (
                !this.parent ||
                this.filter ||
                this.stayFiltered ||
                this.startingUp ||
                this.skipData ||
                this.userClose
            ) {
                return;
            }

            this.termRender();
        };

        this._term._core.viewport = {
            syncScrollArea: () => {},
        };

        this._term._core._keyDown = () => {};
        this._term._core._keyPress = () => {};

        this._term.loadAddon(new Unicode11Addon());
        this._term.unicode.activeVersion = '11';

        this.startRows = this.rows;
        this.startCols = this.cols;

        if (this.options.termType === 'base') {
            this.active = true;
            this.ready = true;
            this.startingUp = false;
        }

        this.term._core._coreMouseService.activeProtocol = 'ANY';

        this._search = new SearchAddon(this._term, this);
    }

    get optionsService() {
        return this.term._core.optionsService;
    }

    get inputHandler() {
        return this.term._core._inputHandler;
    }

    get dirtyRowService() {
        return this.term._core._inputHandler._dirtyRowService;
    }

    get coreService() {
        return this.term._core._coreService;
    }

    get bufferService() {
        return this.term._core._bufferService;
    }

    get serviceBuffer() {
        return this.bufferService.buffer;
    }

    get bufferCursor() {
        const buffer = this.serviceBuffer;
        const y = buffer.ybase + buffer.y;
        if (!buffer.lines) {
            return;
        }

        const bufferLine = buffer.lines.get(y);

        if (!bufferLine) {
            return;
        }

        const x = Math.min(buffer.x, this.cols - 1);

        return { x, y };
    }

    clear(
        { firstLine, render, all } = {
            firstLine: false,
            render: true,
            all: false,
        }
    ) {
        if (!this.term) {
            return;
        }

        if (this.clearSelection) {
            this.clearSelection();
        }

        this.term.clear();

        const buffer = this.term.buffer.active._buffer;

        if (firstLine) {
            buffer.lines.set(0, buffer.getBlankLine());
            buffer.lines.set(1, buffer.getBlankLine());
            buffer.x = 0;
        }

        if (all) {
            for (let x = 0; x < buffer.lines.length; x++) {
                buffer.lines.set(x, buffer.getBlankLine());
            }
            buffer.x = 0;
        }

        if (this.clearBufferCache) {
            this.bufferCache = [];
        }

        if (render) {
            this.termRender(true);
        }
    }

    clearFilterTerm() {
        if (this._filterTerm) {
            if (this.clearSelection) {
                this.clearSelection();
            }

            this._filterTerm.clear();
            const buffer = this._filterTerm.buffer.active._buffer;
            buffer.lines.set(0, buffer.getBlankLine());
            buffer.lines.set(1, buffer.getBlankLine());
            buffer.x = 0;

            if (this.clearBufferCache) {
                this.bufferCache = [];
            }

            this.termRender(true);
        }
    }

    hasSelection() {
        return this.term.hasSelection();
    }

    clearSelection(searchOff = false) {
        if (this.term && this.term.hasSelection()) {
            this.term.clearSelection();
            this.mouseSelecting = false;
        }

        if (searchOff) {
            this.matches = [];
            this.searchString = '';
            this.searchActive = false;
        }
    }

    _scrollBottom() {
        if (!this.term) return super._scrollBottom();

        if (!this.startingUp && this.skipData) {
            return;
        }

        this.childBase = this.term.buffer.active.viewportY;

        return this.term.buffer.active.baseY + this.term.rows;
    }

    dispose(doDestroy) {
        this.disposed =
            this.destroyed || doDestroy !== undefined
                ? doDestroy
                : !this.persisting;

        clearInterval(this.cursorBlinkTimeout);

        this.screen.grabMouse = false;

        if (this._term && this.disposed) {
            this._term.reset();

            if (this._search) {
                this._search.dispose();
            }
            this._term.dispose();
            this._term = null;
        }

        if (this._filterTerm && this.disposed) {
            this._filterTerm.reset();

            if (this._filterSearch) {
                this._filterSearch.dispose();
            }
            this._filterTerm.dispose();
            this._filterTerm = null;
        }

        if (this.disposeProcess) {
            this.disposeProcess();
        }

        if (this.disposeShell) {
            this.disposeShell();
        }
    }

    bindit(methods = []) {
        for (const name of methods) {
            this[name] = this[name].bind(this);
        }
    }

    parentEmit(event, ...args) {
        if (this.uiParent) {
            this.uiParent.emit(event, ...args);
        } else {
            let parent = this.parent;

            while (parent) {
                parent.emit(event, ...args);

                if (parent.type === 'ui') {
                    break;
                }

                parent = parent.parent;
            }
        }
    }

    select(blessedRow, blessedCol, length) {
        const { row, col } = this.blessedToXterm(blessedRow, blessedCol);
        this.term.select(row, col, length);
        this.termRender();
    }

    getSelectionPosition() {
        if (this.term && this.term.hasSelection()) {
            const {
                startColumn: xtermStartColumn,
                startRow: xtermStartRow,
                endColumn: xtermEndColumn,
                endRow: xtermEndRow,
            } = this.term.getSelectionPosition();

            let { row: startRow, col: startColumn } = this.xtermToBlessed(
                xtermStartRow,
                xtermStartColumn
            );

            let { row: endRow, col: endColumn } = this.xtermToBlessed(
                xtermEndRow,
                xtermEndColumn
            );

            return {
                startColumn,
                startRow,
                endColumn,
                endRow,
            };
        }
    }
}

module.exports = XTerminal;
