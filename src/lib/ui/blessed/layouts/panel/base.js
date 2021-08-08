const blessed = require('blessed');

const debounce = require('lodash.debounce');
const throttle = require('lodash.throttle');

const merge = require('lodash.merge');

class PanelBase extends blessed.Box {
    constructor(opts = {}) {
        const options = merge(
            {},
            {
                selectable: true,
                mapKey: 'itemKey',
                mouse: false,
                clickable: false,
                border: {
                    fg: '#006700',
                    type: 'light',
                },
                style: {
                    border: {
                        fg: '#006700',
                        type: 'light',
                    },
                },
            },

            opts
        );

        super(options);

        this.options = options;

        this.itemOpts = this.options.items;
        this.actions = this.options.actions;

        this.keys = Object.keys(this.itemOpts || {});

        this.screenIgnoreLocked = [...this.screen.ignoreLocked];

        this.activeKeys = [];

        this.items = {};

        this.panelLabels = {};

        this._resizeOnFocus = false;

        this.actionHelp = {};

        this.activeKey = 'main';
        this.activated = false;

        this.focusing = null;

        this.containerDisabled = [];

        this.readmeOpen = [];

        this.showItem = this.showItem.bind(this);

        this.dashColor = '#006700';

        this._popover = false;
        this._switching = false;

        this.render = this.render.bind(this);
        this.debug = this.debug.bind(this);
        this.activate = this.activate.bind(this);
        this.initItem = this.initItem.bind(this);
        this.resize = this.resize.bind(this); // debounce(this.resize.bind(this), 50, { leading: true });
        // this.preResize = this.preResize.bind(this);

        this.updateSelectedStyle = debounce(
            this.updateSelectedStyle.bind(this),
            10,
            { leading: true, trailing: true }
        );

        this.init = true;

        this.borderTimeout = null;

        this.initPanelEvents();
    }

    get siblingPanels() {
        return this.parent.children.filter((child) => child !== this);
    }

    set refresh(value) {
        for (const item of this.items) {
            item.refresh = true;
        }
    }

    get resizeOnFocus() {
        return this._resizeOnFocus;
    }

    set resizeOnFocus(value) {
        for (const item of this.items) {
            item.resizeOnFocus = value;
        }
    }

    get uiType() {
        return this.activeItem && this.activeItem.uiType;
    }

    get mainItem() {
        return this.items['main'];
    }

    set freeze(value) {
        if (this.mainItem) {
            this.mainItem.freeze = value;
        }
    }

    get freeze() {
        return this.mainItem && this.mainItem.freeze;
    }

    get type() {
        return 'panel';
    }

    get activeItem() {
        return this.items[this.activeKey] || this.items['main'];
    }

    get activeItems() {
        return this.activeKeys.reduce((acc, curr) => {
            if (this.items[curr] && !this.items[curr].destroyed) {
                return [...acc, this.items[curr]];
            }

            return acc;
        }, []);
    }

    get activeLabels() {
        return this.activeKeys.reduce((acc, curr) => {
            if (
                this.items[curr] &&
                !this.items[curr].destroyed &&
                this.panelLabels[curr] &&
                !this.panelLabels[curr].destroyed
            ) {
                return [...acc, this.panelLabels[curr]];
            }

            return acc;
        }, []);
    }

    get maxFocused() {
        return (
            this.parent.oneMaximized &&
            this.options.gridIndex === this.parent.maximizedIndex
        );
    }

    get oneMaximized() {
        return this.parent.oneMaximized;
    }

    get popover() {
        return this._popover;
    }

    set popover(value) {
        this._popover = value;

        if (this.activeItem) {
            this.activeItem.popover = value;
        }

        if (this.gridActive && this.mainItem && !value) {
            this.mainItem.popover = false;
        }
    }

    get switching() {
        return this._switching;
    }

    set switching(val) {
        if (val === true) {
            this.switchingTimeout =
                this.switchingTimeout ||
                setTimeout(() => {
                    clearTimeout(this.switchingTimeout);
                    this.switchingTimeout = null;
                    if (this.activeItem) {
                        this.activeItem.switching = false;
                    }
                    this._switching = false;
                }, 500);
        }

        this._switching = val;

        if (this.activeItem) {
            this.activeItem.switching = val;
        }
    }

    hide() {
        super.hide();

        if (this.activeItem && this.activeItem) {
            this.activeItem.hide();
        }
    }

    show() {
        super.show();
        if (this.activeItem && this.activeItem) {
            this.activeItem.show();
        }
    }

    _getPos() {
        let noPos = !!this.lpos;

        var pos = this.lpos || this.lastPos;

        // assert.ok(pos);

        if (!pos && this.lastPos) {
            pos = this.lastPos;
        } else {
            this.lastPos = pos;
        }

        if (!pos) {
            return {
                aleft: 0,
                atop: 0,
                aright: 0,
                abottom: 0,
                width: 0,
                height: 0,
            };
        }

        if (pos.aleft != null && !noPos) return pos;

        pos.aleft = pos.xi;
        pos.atop = pos.yi;
        pos.aright = this.screen.cols - pos.xl;
        pos.abottom = this.screen.rows - pos.yl;
        pos.width = pos.xl - pos.xi;
        pos.height = pos.yl - pos.yi;

        this.lastPos = pos;

        return pos;
    }

    screenRender(all, full) {
        if (
            this.activeItem &&
            this.activeItem.parent &&
            this.activeItem.termRender
        ) {
            this.activeItem.termRender(all, full);
        } else {
            this.screen.render();
        }
    }

    activate() {
        if (!this.activated) {
            this.activated = true;
            this.initItem('main');
        }
    }

    write(data) {
        if (this.mainItem && this.mainItem.write) {
            this.mainItem.write(data);
        }
    }

    writeln(data) {
        if (this.mainItem && this.mainItem.writeln) {
            this.mainItem.writeln(data);
        }
    }

    processItems(fn) {
        for (const key of this.activeKeys) {
            if (this.items[key] && !this.items[key].destroyed) {
                fn(this.items[key], this.panelLabels[key], key);
            }
        }
    }

    activeCheck() {
        if (
            this.activeItem &&
            this.activeItem !== this.screen.focused &&
            this.activeItem.focus
        ) {
            this.activeItem.focus();
        }
    }

    debug(txt, txt2, clear) {
        this.parent.debug(txt, txt2, clear);
    }

    resizeItem(idx, force = false) {
        idx = idx || this.activeItem;

        if (typeof odx !== 'object') {
            idx = this.items[idx];
        }

        if (idx && idx.parent) {
            if (idx.resize) {
                idx.resize(force);
            } else {
                idx.emit('resize');
            }
        }
    }

    resize() {
        this.updateLabels();

        this.processItems((item) => {
            if (item) {
                const itemKey = item.itemKey;
                const panelLabel = this.panelLabels[itemKey];

                if (panelLabel && panelLabel.parent) {
                    panelLabel.rtop = (this.childBase || 0) - this.itop;
                    if (!this.screen.autoPadding) {
                        panelLabel.rtop = this.childBase || 0;
                    }
                }

                if (item.parent) {
                    if (this.actionHelp[itemKey]) {
                        const help = this.actionHelp[item.itemKey];

                        help.abottom = this.gridActive
                            ? item.abottom - (item.ibottom + 1)
                            : this.abottom - 1;

                        help.right = this.gridActive
                            ? item.right - (item.iright - 1)
                            : this.iright + 1;
                    }

                    if (this.gridActive && item._label) {
                        if (!this.screen.autoPadding) {
                            item._label.rtop = item.childBase || 0;
                        } else {
                            item._label.rtop =
                                (item.childBase || 0) - item.itop;
                        }
                    }
                }
            }
        });
    }

    onFocus(updateSelStyle = true) {
        if (this.activeItem) {
            this.activeItem.selected = true;
        }

        if (this.activeHelp) {
            this.activeHelp.show();
        } else if (
            !this.activeHelp &&
            this.activeItem &&
            this.activeItem.options.help
        ) {
            this.addHelp(this.activeItem.options.help, this.activeKey);
        }

        if (
            this.parent &&
            (this.parent.type === 'grid' || this.parent.type === 'ui')
        ) {
            this.parent.focusItem(this, false);
        }

        if (updateSelStyle) {
            this.updateSelectedStyle();
        } else if (this.gridActive) {
            this.screen.render();
        } else {
            this.fullRender();
        }
    }

    onBlur(updateSelStyle = true) {
        if (this.maximizing || this.switching) {
            return;
        }

        if (this.activeItem) {
            this.activeItem.selected = false;
        }

        if (this.activeHelp) {
            this.activeHelp.hide();
        }

        if (updateSelStyle) {
            this.updateSelectedStyle();
        } else if (this.gridActive) {
            this.screen.render();
        } else {
            this.fullRender();
        }
    }

    updateSelectedStyle() {
        const selected = this.selected;

        let mainLabel;
        let fg = '#00ff00';

        if (this.mainItem) {
            const { unseenLine, unseenProblem, active } = this.mainItem
                .lineState
                ? this.mainItem.lineState
                : { active: true };

            if (active) {
                if (selected) {
                    fg = '#00ff00';
                } else {
                    fg = '#006700';
                }
            } else {
                if (selected) {
                    fg = '#ff0000';
                } else {
                    fg = '#800000';
                }
            }

            mainLabel = this.mainItem.options.label;

            if (unseenProblem) {
                mainLabel = `! ${mainLabel}`;
            } else if (unseenLine) {
                mainLabel = `▼ ${mainLabel}`;
            } else if (selected) {
                mainLabel = `● ${mainLabel}`;
            } else {
                mainLabel = `  ${mainLabel}`;
            }

            if (this.tab) {
                this.tab.setContent(mainLabel);
                if (selected) {
                    this.tab.style.underline = true;
                } else {
                    this.tab.style.underline = false;
                }

                this.tab.style.fg = active
                    ? this.gridActive
                        ? '#00f0a4'
                        : '#00ff00'
                    : '#ff000';
            }

            if (this.mainItem.filter) {
                let filterInfo =
                    this.mainItem.filter.length > 10
                        ? this.mainItem.filter.substr(0, 10) + '...'
                        : this.mainItem.filter;

                filterInfo = ` (${filterInfo})`;

                mainLabel += filterInfo;
            }
        }

        if (!this.gridActive) {
            this.border.type = selected ? 'heavy' : 'light';
            this.border.fg = fg;
            this.style.border.type = this.border.type;
            this.style.border.fg = this.border.fg;

            if (selected && this.activeHelp && this.activeHelp.hidden) {
                this.activeHelp.show();
            }

            if (this.lastFg !== fg) {
                this.updateHelp();
            }

            this.lastFg = fg;
        }

        this.updateMainLabel(mainLabel);
        this.updateLabels();

        if (!this.gridActive) {
            this.fullRender();
        } else {
            this.screen.render();
        }
    }

    initPanelEvents() {
        this.on('line state', (item) => {
            if (item === this.mainItem && !this.gridActive) {
                this.updateSelectedStyle();
            }
        });

        this.on('rightclick', () => {
            this.options.actions['C-a'](this.activeItem, this);
        });

        this.on('selected', (select, focused) => {
            if (select) {
                this.onFocus();

                setTimeout(() => {
                    if (this.parent && !this.gridActive) {
                        const pChildren = this.parent.children;
                        for (const child of pChildren) {
                            if (child === this) {
                                continue;
                            }

                            if (child.type === this.type && child.selected) {
                                child.selected = false;
                                child.emit('selected', false);
                            }
                        }
                    }
                }, 5);
            } else if (
                this.activeItem &&
                !this.switching &&
                !this.maximizing &&
                !this.activeItem.promptOpen &&
                !this.activeItem.copyPromptOpen &&
                !this.screen.exitOpen
            ) {
                this.onBlur();
            }
        });
        this.screen.on(
            'resize',
            debounce(this.resize, 100, { leading: true, trailing: true })
        );

        this.on('focus', () => {
            if (this.activeItem) {
                this.activeItem.focus();
            }
        });
        let index = 0;

        this.screen.key(
            ['M-left', 'C-left'],
            throttle(() => {
                if (this.selected) {
                    this.subPanelSelect = true;
                    if (this.gridActive) {
                        this.focusLeft();
                    } else if (this.activeKeys.length > 1) {
                        const index = this.activeKeys.indexOf(this.activeKey);
                        if (index - 1 >= 0) {
                            this.showItem(this.activeKeys[index - 1]);
                        } else {
                            this.showItem(
                                this.activeKeys[this.activeKeys.length - 1]
                            );
                        }

                        process.nextTick(() => {
                            this.subPanelSelect = false;
                        });
                    }
                }
            }, 100)
        );

        this.screen.key(
            ['M-right', 'C-right'],
            throttle(() => {
                if (this.selected) {
                    this.subPanelSelect = true;
                    if (this.gridActive) {
                        this.focusRight();
                    } else if (this.activeKeys.length > 1) {
                        const index = this.activeKeys.indexOf(this.activeKey);
                        if (index + 1 < this.activeKeys.length) {
                            this.showItem(this.activeKeys[index + 1]);
                        } else {
                            this.showItem(this.activeKeys[0]);
                        }

                        process.nextTick(() => {
                            this.subPanelSelect = false;
                        });
                    }
                }
            }, 100)
        );

        this.screen.key(
            ['M-up', 'C-up'],
            throttle(() => {
                if (this.selected && this.gridActive) {
                    this.focusUp();
                }
            }, 100)
        );

        this.screen.key(
            ['M-down', 'C-down'],
            throttle(() => {
                if (this.selected && this.gridActive) {
                    this.focusDown();
                }
            }, 100)
        );

        let runningAction = false;

        this.screen.on('keypress', async (ch, key) => {
            if (
                this.activeItem &&
                this.screen.focused === this.activeItem &&
                this.options.actions &&
                this.options.actions[key.full] &&
                !runningAction
            ) {
                runningAction = true;

                await this.options.actions[key.full](this.activeItem, this);

                runningAction = false;
            }
        });
    }

    getDashColor() {
        return this.border.fg.includes('bright') ||
            this.border.fg.includes('light')
            ? this.border.fg.replace('bright', '').replace('light', '') +
            'Bright'
            : this.border.fg;
    }
}

module.exports = PanelBase;
