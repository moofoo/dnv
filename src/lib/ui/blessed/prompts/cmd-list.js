const blessed = require('blessed');
const chalk = require('chalk');
const merge = require('lodash.merge');
const UI = require('../layouts/ui');

class CmdList extends blessed.List {
    constructor(opts = {}) {
        const height = opts.positionParent.height - 9 <= 4 ? 9 : '100%-9';

        const options = merge(
            {},
            {
                content: 'Loading...',
                align: 'center',
                left: 'center',
                width: 35,
                height,
                top: 1,
                left: 2,
                mouse: true,
                keys: true,
                interactive: true,
                focused: true,
                scrollable: true,
                shadow: true,
                insideWheel: false,
                outsideClick: true,
                borderMark: true,
                /* scrollbar: {
                    ch: ' ',
                    style: { bg: 'white' },
                },*/
                border: {
                    type: 'lightDouble',
                    fg: 'cyan',
                    bg: 'black',
                },
                style: {
                    border: {
                        type: 'lightDouble',
                        fg: 'cyan',
                        bg: 'black',
                    },
                    label: {
                        fg: '#fdff92',
                    },
                    bg: 'black',
                    item: {
                        fg: 'brightwhite',
                        bold: true,
                    },
                    selected: {
                        bold: true,
                        fg: 'cyan',
                        underline: true,
                    },
                },
            },
            opts
        );

        super(options);

        this.grabMouse = true;
        this.grabKeys = true;

        this.screen._listenMouse(this);

        this.loading = true;

        this.align = this.options.itemAlign || 'right';

        this.options = options;

        this.itemOpts = this.options.itemOpts;

        this.itemList = [];

        this.categories = [];
        this.categoryColors = this.options.categoryColors || {};

        this.argsOpen = false;

        this.cacheItems = this.options.cacheItems;
        this.fromCache = (this.options.fromCache || []).length
            ? this.options.fromCache
            : null;

        this.panel = this.options.panel;
        this.subPanel = this.options.subPanel;

        this.action = this.options.action.bind(this);
        this.initItems = this.initItems.bind(this);
        this.initCmdListEvents = this.initCmdListEvents.bind(this);
        this.onEnter = (this.options.onEnter || this.genericOnEnter).bind(this);
        this.showArgumentsPrompt = this.showArgumentsPrompt.bind(this);

        this.switchingPanels = false;
        this.switchingSubPanels = false;

        this.activate();
    }

    get type() {
        return 'prompt';
    }

    activate() {
        const screen = this.screen;
        const panel = this.panel;

        panel.popover = true;
        panel.switching = true;

        UI.hideCursor(screen);

        this.grabMouse = true;
        this.grabKeys = true;

        this.value = undefined;
        screen.grabMouse = true;
        screen.grabKeys = true;
        screen.promptOpen = true;

        screen.render();

        (async () => {
            if (!this.itemOpts && this.fromCache) {
                this.itemList = this.fromCache;
                this.setItems(this.fromCache);
            } else {
                await this.initItems(this.fromCache || this.itemOpts);
            }

            this.loading = false;

            if (!this.exiting) {
                this.initCmdListEvents();

                if (this.subPanel.termRender) {
                    this.subPanel.popoverCoords = this._getCoords(true);
                }

                this.focus();

                this.select(this.options.startSelection || 0);

                this.emit('resize');

                this.screen.render();

                setTimeout(() => {
                    this.focus();
                });
            }
        })();
    }

    initCmdListEvents() {
        const screen = this.screen;
        const panel = this.panel;
        const subPanel = this.subPanel;
        const categories = this.categories;

        if (this.options.categories) {
            this.on('select item', (item, index, data) => {
                if (!this.categories[index]) {
                    return;
                }

                const el = this.categories[index];

                el.style.underline = true;

                if (this.lastItem) {
                    this.lastItem.style.underline = false;
                }

                this.lastItem = el;
            });
        }

        setTimeout(() => {
            this.on('destroy', () => {
                this.grabMouse = false;
                this.grabKeys = false;
                this.exiting = true;
                this.options.positionParent = null;

                while (categories.length) {
                    categories.shift().destroy();
                }

                this.hide();

                screen.grabMouse = false;
                screen.grabKeys = false;
                screen.promptOpen = false;

                panel.popover = false;
                panel.switching = false;
                subPanel.popover = false;

                if (subPanel.termRender) {
                    subPanel.termRender(false, true);
                }

                process.nextTick(() => {
                    if (!this.switchingPanels && panel.selected) {
                        panel.focus();
                    }

                    screen.render();
                });
            });

            this.key('space', () => {
                if (!this.exiting && !this.loading) {
                    this.showArgumentsPrompt(this.value);
                }
            });

            this.on('keypress', (ch, key) => {
                if (
                    [
                        'C-left',
                        'C-right',
                        'C-up',
                        'C-down',
                        'M-left',
                        'M-right',
                        'M-up',
                        'M-down',
                        'escape',
                    ].includes(key.full)
                ) {
                    if (
                        ['C-left', 'C-right', 'C-up', 'C-down'].includes(
                            key.full
                        )
                    ) {
                        this.switchingPanels = true;
                    } else if (
                        ['M-left', 'M-right', 'M-up', 'M-down'].includes(
                            key.full
                        )
                    ) {
                        this.switchingSubPanels = true;
                    }

                    this.destroy();
                }
            });

            this.selecting = false;

            this.on('select', async (item, index, data) => {
                if (this.loading || this.selecting || this.exiting) {
                    return;
                }

                this.selecting = true;

                this.removeAllListeners('select');

                this.hide();

                await this.onEnter(data, item, index);

                this.exiting = true;

                process.nextTick(() => {
                    this.destroy();
                });
            });
        }, 125);
    }

    async initItems(items) {
        if (this.exiting) {
            return;
        }

        let fns = items.filter((item) => {
            return typeof item === 'function';
        });

        const objs = items.filter((item) => {
            return typeof item === 'object' && !fns.includes(item);
        });

        let results = [];

        if (fns.length) {
            fns = fns.map((item) => item());

            results = (await Promise.allSettled(fns))
                .filter((result) => result.status !== 'rejected')
                .map((result) => result.value)
                .flat();
        }

        items = [...objs, ...results];

        if (this.options.disabled && this.options.disabled.length) {
            items = items.filter(
                (item) =>
                    !this.options.disabled.includes(item.cmd) &&
                    !this.options.disabled.includes(item.name)
            );
        }

        if (this.options.filterItems) {
            items = this.options.filterItems(items);
        }

        const spareColors = ['red', 'yellow', 'green', 'magenta'];

        if (typeof this.cacheItems === 'function') {
            this.cacheItems(items);
        }

        items.forEach((item) => {
            if (this.options.categories) {
                const { category } = item;
                if (!this.categoryColors[category]) {
                    this.categoryColors[category] = spareColors.shift();
                }

                const categoryColor = this.categoryColors[category];
                item.categoryColor = categoryColor;
            }

            this.itemList.push(item);
        });

        if (items.length === 0) {
            this.setItems([{ name: 'Nothing found' }]);
        } else {
            this.setItems(this.itemList);

            if (this.options.categories) {
                this.items.forEach((item, index) => {
                    const { category, categoryColor } = this.itemList[index];

                    this.categories.push(
                        new blessed.box({
                            parent: this,
                            top: item.top - 1,
                            left: item.left,
                            shrink: true,
                            height: 1,
                            align: 'left',
                            content: `${chalk[categoryColor].bold(category)}`,
                            focused: false,
                        })
                    );
                });
            }
        }
    }

    async genericOnEnter(selected, item, index) {
        if (this.loading || this.exiting) {
            return;
        }

        selected = selected || this.itemList[index];

        const { category, cmd, name, shell } = selected;
        await this.action(
            name,
            cmd,
            shell,
            category,
            typeof cmd === 'string' && cmd.includes(' '),
            this.selected
        );
    }

    showArgumentsPrompt(selected) {
        const screen = this.screen;
        const { detail, category, cmd, name, shell, categoryColor } = selected;

        if (!name) {
            return;
        }

        this.argsOpen = true;

        const opts = {
            label: detail ? 'Command' : 'Arguments',
            parent: this.screen,
            positionParent: this.subPanel,
            width: '95%',
            height: 3,
            left: 1,
            bottom: 1,
            border: {
                type: 'line',
                fg: categoryColor,
            },
            padding: {
                left: 1,
            },
            shadow: [0.58, 0.3],
        };

        const argsContainer = blessed.box(opts);

        const commandBox = blessed.box({
            content: name,
            parent: argsContainer,
            valign: 'center',
            align: 'center',
            top: 'center',
            left: 0,
            width: name.length + 2,
            height: 1,
            style: {
                fg: 'brightcyan',
                bg: 'black',
            },
        });

        const argsPrompt = blessed.textarea({
            debug: this.panel.debug,
            screen,
            parent: argsContainer,
            inputOnFocus: false,
            valign: 'center',
            top: 'center',
            left: name.length + 3,
            height: 1,
            width: `97%-${name.length + 3}`,
            style: {
                fg: 'white',
                bg: 'black',
            },
            value: '',
            keys: false,
        });

        argsPrompt.on('focus', () => {
            argsPrompt.setFront();

            argsPrompt.show();
            argsPrompt.readInput();

            if (detail) {
                argsPrompt.setValue(detail, true);
            } else {
                argsPrompt.setValue('');
            }

            UI.showCursor(screen);
        });

        argsPrompt.on('cancel', () => {
            argsPrompt.destroy();
            commandBox.destroy();
            argsContainer.destroy();
            this.argsOpen = false;

            this.focus();
            UI.hideCursor(screen);
            screen.render();
        });

        argsPrompt.key('escape', () => {
            argsPrompt.emit('cancel');
        });

        argsPrompt.key('C-x', () => {
            argsPrompt.setValue('');
            screen.render();
        });

        argsPrompt.key('return', async () => {
            if (this.exiting || this.selecting) {
                return;
            }

            this.selecting = true;

            const value = argsPrompt.getValue().trim();

            if (value.length) {
                if (detail) {
                    await this.action(name, value, shell, category, true);
                } else {
                    await this.action(
                        name,
                        cmd + ' ' + value,
                        shell,
                        category,
                        true
                    );
                }
            } else {
                await this.action(name, cmd, shell, category, false);
            }

            this.argsOpen = false;

            this.destroy();
            screen.render();
            screen.grabKeys = false;
            UI.hideCursor(screen);
        });

        argsPrompt.key('C-c', () => {
            argsPrompt.destroy();
            commandBox.destroy();
            argsContainer.destroy();

            process.nextTick(() => {
                screen._savedFocus = this;
            });

            this.argsOpen = false;

            screen.render();
            screen.grabKeys = false;
            UI.hideCursor(screen);
        });

        argsContainer.setFront();
        argsPrompt.focus();
        screen.render();
    }
}

module.exports = CmdList;
