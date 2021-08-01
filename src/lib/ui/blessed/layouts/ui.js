const blessed = require('blessed');
const Grid = require('./grid');
const cliCursor = require('cli-cursor');

let renderTimeout = null;
let renderTail = null;

blessed.Listbar.prototype._render = blessed.Element.prototype._render;

class UI extends Grid {
    static editorsOpen = 0;
    static searches = [];
    static filters = [];
    static cursorHidden = true;

    static hideCursor(screen) {
        cliCursor.hide();
        if (screen) {
            screen.program.cursorHidden = true;
        }
        UI.cursorHidden = true;
    }

    static showCursor(screen) {
        cliCursor.show();
        if (screen) {
            screen.program.cursorHidden = false;
        }
        UI.cursorHidden = false;
    }

    constructor(opts = {}) {
        const options = {
            ...opts,
            rows: 'auto',
            cols: 2,
            perPage: 4,
            yOffset: [4, -1],
            heightOffset: [-1, 1],
            top: 0,
            left: 1,
            width: '99%',
            height: '100%',
            style: {
                bg: 'black',
            },
            gutters: {
                vertical: 2,
                horizontal: 4,
            },
            widthFn: ({
                col,
                cols,
                colSpan,
                width,
                widthOffset,
                widthSign,
                parentWidth,
            }) => {
                if (colSpan > 1 && colSpan === cols) {
                    return `100%`;
                } else if (
                    parentWidth < 200 &&
                    col > 0 &&
                    colSpan === 1 &&
                    parentWidth % 2 !== 0
                ) {
                    return `${Math.ceil(width * colSpan)}%`;
                } else if (
                    parentWidth > 200 &&
                    col > 0 &&
                    colSpan === 1 &&
                    parentWidth % 2 === 0
                ) {
                    return `${Math.ceil(width * colSpan)}%`;
                } else {
                    return `${Math.ceil(width * colSpan)}%${widthSign}${
                        widthOffset !== 0 ? Math.abs(widthOffset) : ''
                    }`;
                }
            },
            heightFn: ({
                row,
                rows,
                rowSpan,
                height,
                heightOffset,
                heightSign,
                parentHeight,
            }) => {
                if (row > 0 && parentHeight % 2 !== 0) {
                    return `${Math.ceil(height * rowSpan)}%`;
                } else {
                    return `${Math.ceil(height * rowSpan)}%${heightSign}${
                        heightOffset !== 0 ? Math.abs(heightOffset) : ''
                    }`;
                }
            },
        };

        if (options.items.length === 1) {
            options.height = '100%-1';
        }

        if (options.items.length === 2) {
            options.cols = 1;
            options.perPage = 2;
        }

        super(options);

        UI.screen = this.screen;

        this.promptOpen = false;

        this.panelGridMaximized = false;
        this.maximizedIndexOnPage = {};
        this.oneMaximizedOnPage = {};

        for (let x = 0; x < this.pages; x++) {
            this.maximizedIndexOnPage[x] = null;
            this.oneMaximizedOnPage[x] = false;
        }
    }

    get maximizedIndex() {
        return (
            this.maximizedIndexOnPage &&
            this.maximizedIndexOnPage[this.currentPage]
        );
    }

    set maximizedIndex(value) {
        if (this.maximizedIndexOnPage) {
            const index = this.getItemIndex(value);

            this.maximizedIndexOnPage[this.currentPage] = index;
        }
    }

    get oneMaximized() {
        return (
            this.oneMaximizedOnPage && this.oneMaximizedOnPage[this.currentPage]
        );
    }

    set oneMaximized(value) {
        if (this.oneMaximizedOnPage) {
            this.oneMaximizedOnPage[this.currentPage] = value;
        }
    }

    postInit() {
        super.postInit();
        this.initUi();

        for (const child of this.children) {
            child.listBarCoords = { ...this.listBar.position };
        }

        const helpMessage = blessed.box({
            parent: this.screen,
            top: 2,
            right: 5,
            height: 1,
            shrink: true,
            content: 'Press F9 for Help',
            style: {
                fg: 'brightyellow',
                bold: true,
                italics: true,
            },
        });

        setTimeout(() => {
            helpMessage.destroy();
        }, 2000);
    }

    resizeItem(item) {
        const ok = !!item.parent;

        if (ok) {
            if (item.resize) {
                item.resize(true);
            } else {
                item.emit('resize');
            }

            for (const child of item.children) {
                this.resizeSort(child);
            }
        }
    }

    resizeSort(key) {
        const item = this.getItem(key, false);

        if (!item.hidden && item.parent) {
            this.resizeItem(item);
        } else if (
            item.parent &&
            (!item.resizeOnFocus || item.type === 'grid')
        ) {
            this.nextTicks.push(this.resizeItem.bind(this, item));
        }
    }
    resizeAll(startKey) {
        this.nextTicks = [];

        this.resizeSort(startKey);

        if (this.nextTicks.length) {
            while (this.nextTicks.length) {
                process.nextTick(this.nextTicks.shift());
            }
        }
    }

    maximizeItem(key, panelGrid, maximizer) {
        const item = this.getItem(key);

        const isMaximized = item.maximized;

        if (
            isMaximized &&
            (item.gridActive || (!item.gridActive && !panelGrid))
        ) {
            this.hideOthers(key);
            this.show();

            this.maximizedIndex = this.getItemIndex(key);

            if (item.termRender) {
                item.termRender(false, true);
            } else {
                this.screen.render();
            }

            return;
        }

        item.maximized = true;

        if (!isMaximized) {
            this.hideOthers(key);

            if (panelGrid) {
                this.screen.emit('pre-resize');
            }
        }

        const yOffset =
            (Array.isArray(this.options.yOffset)
                ? this.options.yOffset[0]
                : this.options.yOffset) || 0;

        const xOffset =
            (Array.isArray(this.options.xOffset)
                ? this.options.xOffset[0]
                : this.options.xOffset) || 0;

        this.oneMaximized = true;
        this.maximizedIndex = this.getItemIndex(key);

        if (item.maximize) {
            item.itemMaximized = true;
            item.maximize({
                top: yOffset,
                left: xOffset,
                xOffset,
                yOffset,
                width: `100%`,
                height: `100%`,
                panelGrid,
                resize: this.resizeAll.bind(this, item, false, panelGrid),
                hideOthers: () => {
                    this.hideOthers(key);
                },
                maximizer,
            });
        } else {
            item.itemMaximized = false;
            item.top = yOffset;
            item.left = xOffset;
            item.width = `99%-${xOffset}`;
            item.height = `99%-${yOffset}`;

            this.resizeAll(item);
        }
    }

    minimizeItem(key, minimizer = null) {
        const item = this.getItem(key);

        const gridActive = item.gridActive;

        const isMaximized = item.maximized;

        item.maximized = false;

        if (isMaximized) {
            if (minimizer && item.gridActive) {
                this.screen.emit('pre-resize');
            }

            if (item.minimize) {
                item.minimize({
                    top: item.options.top,
                    left: item.options.left,
                    width: item.options.width,
                    height: item.options.height,
                    minimizer,
                });
            } else {
                item.top = item.options.top;
                item.left = item.options.left;
                item.width = item.options.width;
                item.height = item.options.height;
            }

            if (minimizer) {
                this.oneMaximized = false;
                this.maximizedIndex = null;

                this.showPage(this.currentPage);

                if (gridActive) {
                    process.nextTick(() => {
                        this.screen.emit('resize');
                    });
                }
            }

            return;
        }

        if (item.blur) {
            item.blur();
        } else {
            item.emit('blur');
        }
    }

    focusItem(key) {
        if (this.oneMaximized) {
            const maximized = this.getItem(this.maximizedIndex);

            if (maximized.blur) {
                maximized.blur();
            } else {
                maximized.emit('blur');
            }

            maximized.hide();

            this.maximizeItem(this.getItemIndex(key));
        }

        super.focusItem(key);
    }

    showPage(page) {
        super.showPage(page, (child) => {
            if (this.oneMaximized) {
                if (child.maximized) {
                    child.show();
                    return true;
                }

                return false;
            } else {
                if (child.maximized) {
                    this.minimizeItem(child, null);
                }

                if (child.hidden) {
                    child.show();
                }
                return true;
            }
        });
    }

    initUi() {
        this.initListBar();

        this.on('resize-all', (item) => {
            if (this.resizingAll) {
                return;
            }

            this.resizingAll = true;

            this.resizeAll(item);

            setTimeout(() => {
                this.resizingAll = false;
            });
        });

        this.on('prompt open', (hideBar = true) => {
            this.promptOpen = true;
            this.processKeys = false;
            if (hideBar) {
                this.listBar.hide();
            }

            this.fullRender();
        });

        this.on('prompt close', () => {
            this.promptOpen = false;
            this.listBar.show();
            this.listBar.setFront();
            this.fullRender();
            setTimeout(() => {
                this.processKeys = true;
            });
        });

        this.on('subpanel on', () => {
            this.processKeys = false;
        });

        this.on('subpanel off', () => {
            this.processKeys = true;
        });

        this.on('set label', (label, item) => {
            const gridItem = this.getItem(item.options.gridIndex);
            gridItem.tab.setContent(label);
            gridItem.tab.width = label.length;

            this.fullRender();
        });

        this.screen.key('M-x', () => {
            if (
                this.itemsOnPage() > 1 &&
                this.processKeys &&
                !this.screen.promptOpen &&
                !this.maxMinTimeout &&
                !this.navTimeout &&
                !this.getItem(this.focusedIndex).preResizing
            ) {
                this.maxMinTimeout =
                    this.maxMinTimeout ||
                    setTimeout(() => {
                        clearTimeout(this.maxMinTimeout);
                        this.maxMinTimeout = null;
                    }, 150);

                if (this.oneMaximized) {
                    this.minimizeItem(this.focusedIndex, true);
                } else {
                    this.maximizeItem(this.focusedIndex, false, true);
                }
            }
        });

        this.screen.key('M-S-x', () => {
            if (
                this.processKeys &&
                !this.screen.promptOpen &&
                !this.maxMinTimeout &&
                !this.navTimeout &&
                !this.getItem(this.focusedIndex).preResizing
            ) {
                this.maxMinTimeout =
                    this.maxMinTimeout ||
                    setTimeout(() => {
                        clearTimeout(this.maxMinTimeout);
                        this.maxMinTimeout = null;
                    }, 150);

                this.maximizeItem(this.focusedIndex, true, true);
            }
        });

        this.screen.key(['M-left', 'M-right'], () => {
            this.navTimeout =
                this.navTimeout ||
                setTimeout(() => {
                    clearTimeout(this.navTimeout);
                    this.navTimeout = null;
                }, 150);
        });
    }

    get type() {
        return 'ui';
    }

    get childSelected() {
        for (const child of Object.values(this.children)) {
            if (this.screen.focused === child) {
                return true;
            }
        }

        return false;
    }

    initListBar() {
        let { rows, cols, perPage } = this.options;

        if (rows === 'auto') {
            rows = Math.ceil(perPage / cols);
            this.options.rows = rows;
        }

        let currentRow = 0;
        let currentCol = 0;
        let currentPage = 0;

        this.listBar = blessed.listbar({
            parent: this.screen,
            top: 1,
            left: 1,
            width: '99%',
            height: 3,
            keys: false,
            autoCommandKeys: false,
            mouse: true,
            mouseFocus: false,
            border: {
                type: 'double,',
                fg: 'brightblue',
                bottom: true,
                left: true,
                right: true,
                top: true,
            },
            style: {
                border: {
                    type: 'double',
                    fg: 'brightblue',
                    bottom: true,
                    left: true,
                    right: true,
                    top: true,
                },
                item: {
                    fg: 'brightgreen',
                    bg: 'black',
                    focused: {
                        bg: 'black',
                    },
                },
                focused: {
                    bg: 'black',
                },
                bg: 'black',
            },
        });

        this.listBarPages = [];

        this.listBar.add({
            text: `Pg ${currentPage + 1}`,
            callback: () => {},
        });

        this.listBarPages.push(
            this.listBar.children[this.listBar.children.length - 1]
        );

        let x = 0;

        for (const child of this.children) {
            let { key, tabLabel, label } = this.options.items[x];

            if (!key) {
                key = label;
            }

            if (!tabLabel) {
                tabLabel = label;
            }

            if (x > 0 && x % perPage === 0) {
                currentPage++;

                this.listBar.add({
                    text: '|',
                    callback: () => {},
                });

                this.listBar.children[
                    this.listBar.children.length - 1
                ].separator = true;

                this.listBar.add({
                    text: `Pg ${currentPage + 1}`,
                    callback: () => {
                        this.showPage(currentPage);
                    },
                });

                this.listBarPages.push(
                    this.listBar.children[this.listBar.children.length - 1]
                );

                currentCol = 0;
                currentRow = 0;
            }

            this.listBar.add({
                mouse: true,
                text: ` ${tabLabel} `,
                callback: () => {
                    this.focusItem(child);
                },
            });

            const tab = this.listBar.children[this.listBar.children.length - 1];

            tab.gridIndex = x;

            tab.panel = child;
            child.tab = tab;

            currentCol++;
            if (currentCol >= cols) {
                currentCol = 0;
                currentRow++;
            }

            x++;
        }

        this.screen.append(this.listBar);

        this.listBarPages.forEach(
            function (page, index) {
                page.page = true;
                page.style.fg = () => {
                    if (index === this.currentPage) {
                        return 'brightcyan';
                    }

                    return 'default';
                };

                page.on('click', () => {
                    this.showPage(index);
                });
            }.bind(this)
        );

        setTimeout(() => {
            if (this.parent === this.screen && this.focusChild) {
                this.focusChild.focus();
                this.focusChild = null;
            }

            this.screen.render();
        });
    }
}

module.exports = UI;
