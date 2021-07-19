const blessed = require('blessed');
const merge = require('lodash.merge');
const logSymbols = require('log-symbols');

class WatchingList extends blessed.List {
    constructor(opts = {}) {
        const options = merge(
            {},
            {
                content: 'Loading...',
                align: 'left',
                left: 'center',
                height: '100%-9',
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
                /* scrollbar: {
                    ch: ' ',
                    style: { bg: 'white' },
                },*/
                border: {
                    type: 'line',
                    fg: 'cyan',
                    bg: 'black',
                },
                style: {
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

        this.services = this.options.services;

        this.grabMouse = true;

        this.align = this.options.itemAlign || 'right';

        this.options = options;

        this.itemOpts = this.options.itemOpts;

        this.itemList = this.panel = this.options.panel;
        this.subPanel = this.options.subPanel;
        this.action = this.options.action.bind(this);

        this.initWatchingListEvents();

        this.activate();
    }

    get type() {
        return 'prompt';
    }

    activate() {
        this.subPanel.popover = true;

        this.getListItems();

        this.focus();
        this.setFront();
        this.select(0);

        this.emit('resize');
        this.screen.render();
    }

    getListItems() {
        const items = [];

        for (const [name, service] of Object.entries(this.services)) {
            if (
                service.watching !== undefined &&
                !items.find((item) => item.shortPath === service.shortPath)
            ) {
                items.push({
                    serviceName: name,
                    services: [name],
                    shortPath: service.shortPath,
                    value: name,
                    path: service.path,
                    watching: service.watching,
                });
            }
        }

        if (Object.keys(this.services).length > items.length) {
            for (const item of items) {
                const { value, path, services: itemName } = item;

                for (const [name, service] of Object.entries(this.services)) {
                    if (
                        service.path === path &&
                        name !== value &&
                        !itemName.includes(name)
                    ) {
                        item.services.push(name);
                    }
                }
            }
        }
        let length = 0;
        for (const item of items) {
            item.name = `${item.services.join('/')}\t${item.shortPath}  ${
                item.watching ? '✔️' : '✖️'
            }`;

            if (item.name.length > length) {
                length = item.name.length;
            }
        }

        this.itemList = [...items];

        this.setItems(items);

        this.width = length + 7;
    }

    async onEnter(selected, item, index) {
        if (this.exiting) {
            return;
        }

        selected = selected || this.itemList[index];

        const { services } = selected;

        await this.action(services, this.updateItems.bind(this));
    }

    updateItems(services) {
        this.services = services;

        this.getListItems();

        this.render();

        this.screen.render();
    }

    initWatchingListEvents() {
        const screen = this.screen;

        this.on('focus', () => {
            this.subPanel.popover = true;

            this.subPanel.popoverCoords = this._getCoords(true);

            process.nextTick(() => {
                screen.promptOpen = true;
                screen.grabKeys = true;
                screen.grabMouse = true;
            });
        });

        this.on('destroy', () => {
            this.options.positionParent = null;

            const subPanel = this.subPanel;

            subPanel.focus();
            screen.render();

            setTimeout(() => {
                screen.promptOpen = false;
                screen.grabKeys = false;
                screen.grabMouse = false;

                process.nextTick(() => {
                    subPanel.popover = false;
                    screen.render();
                });
            }, 75);
        });

        setTimeout(() => {
            this.on('out-click', () => {
                this.exiting = true;
                this.subPanel.popover = true;
                this.destroy();
            });

            this.key('escape', () => {
                this.exiting = true;
                this.subPanel.popover = true;
                this.destroy();
            });

            this.on('keypress', (ch, key) => {
                if (
                    ['M-left', 'M-right', 'M-up', 'M-down'].includes(key.full)
                ) {
                    this.exiting = true;
                    this.subPanel.popover = true;
                    this.destroy();
                }
            });

            this.selecting = false;

            this.on('select', async (item, index, data) => {
                if (this.exiting) {
                    return;
                }

                index = index || 0;

                const { name, value } = this.items[index];

                this.options.debug(
                    index,
                    `${JSON.stringify(this.itemList[index])} `
                );

                this.onEnter(this.itemList[index], item, index);
            });
        }, 125);
    }

    render() {
        let ret = this._render();
        if (!ret) return;

        const start = Math.max(ret.yi, 0);
        const end = ret.yl;
        const left = Math.max(ret.xi, 0);
        const right = ret.xl;

        let x = 0;
        let y = 0;
        let sline;

        for (y = start; y < end; y++) {
            sline = this.screen.lines[y];

            for (x = left; x < right; x++) {
                if (!sline[x]) {
                    break;
                }

                if (sline[x][1] === '✔️' || sline[x][1] === '✖️') {
                    sline[x][2] = true;
                    sline[x + 1][2] = true;
                    sline.dirty = true;
                } else {
                    sline[x].length = 2;
                }
            }
        }

        return ret;
    }
}

module.exports = WatchingList;
