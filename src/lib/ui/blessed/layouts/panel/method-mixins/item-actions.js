const omit = require('lodash.omit');
const cloneDeep = require('lodash.clonedeep');
const memoize = require('lodash.memoize');
const merge = require('lodash.merge');

const { specialTerminalOptions } = require('../../../../special-terms');


const testFn = memoize((FnOrClass) => {
    return Object.getOwnPropertyNames(FnOrClass).includes('caller');
});

class ItemActions {
    showItem(
        itemKey,
        processItems = false,
        focus = true,
        updateSelStyle = true
    ) {
        if (itemKey === undefined) {
            itemKey = this.activeKey || 'main';
        }

        if (!this.items[itemKey] && !this.init) {
            this.selected = true;
        }

        if (!isNaN(itemKey)) {
            itemKey = this.activeKeys[itemKey];
        } else if (typeof itemKey === 'object') {
            itemKey =
                itemKey.itemKey ||
                itemKey.options.itemKey ||
                itemKey.key ||
                itemKey.options.key;
        }

        if (!this.items[itemKey] || this.items[itemKey].destroyed) {
            itemKey = 'main';
        }

        if (itemKey === this.activeKey) {
            return;
        }

        if (this.activeKey !== itemKey && this.activeHelp) {
            this.activeHelp.hide();
        }

        const oldActiveKey = this.activeKey;

        this.activeKey = itemKey;

        if (
            !this.gridActive &&
            this.activeKey !== 'main' &&
            oldActiveKey === 'main' && this.mainItem
        ) {
            this.mainItem.hide();
        }

        if (this.activeItem) {
            if (this.activeItem.hidden) {
                this.activeItem.show();
            }

            if (focus && this.screen.focused !== this.activeItem) {
                this.activeItem.focus();
            }

            if (this.activeHelp) {
                this.activeHelp.show();
                this.activeHelp.setFront();
            } else if (!this.activeHelp && this.activeItem.options.help) {
                this.addHelp(this.activeItem.options.help, this.activeKey);
            }
        }

        if (!this.gridActive && (processItems || this.subPanelSelect)) {
            this.processItems((item, label, key) => {
                if (key !== itemKey) {
                    if (
                        key === 'main' ||
                        !item.ready ||
                        item.preResizing ||
                        item.resizing
                    ) {
                        if (!item.hidden) {
                            item.hide();
                        }
                    } else if (item.parent) {
                        item.hide();
                    }
                }
            });
        }
        let gridChange = false;

        if (this.gridActive && this.gridCount !== this.activeKeys.length) {
            let adding = false;

            if (this.activeKeys.length > this.gridCount) {
                adding = true;
            }
            this.gridCount = this.activeKeys.length;

            if (this.gridCount > 1 && this.activeItem) {
                if (!adding) {
                    this.prepGridItems(true, adding);
                }
                setTimeout(() => {
                    if (this.activeHelp) {
                        this.activeHelp.show();
                        this.screen.render();
                    }
                }, 50);

            } else {
                this.parent.minimizeItem(this.key, true);
            }
        }

        if (!this.hidden && !this.init) {
            this.resize();

            if (gridChange) {
                this.screen.render();
                return;
            }
        }

        if (updateSelStyle) {
            this.updateSelectedStyle();
        } else if (this.gridActive) {
            this.screen.render();
        } else {
            this.fullRender();
        }

        this.init = false;
    }

    initItem(itemKey = 'main', iOpts) {
        let itemOpts = iOpts ? { ...iOpts } : { ...this.itemOpts[itemKey] };

        if (itemKey !== 'main') {
            this.keyCount = this.keyCount || {};
            this.keyCount[itemKey] = this.keyCount[itemKey] || 0;
            this.keyCount[itemKey]++;

            itemKey = `${itemKey}${this.keyCount[itemKey]}`;
        }

        const Widget = itemOpts.widget;

        if (Widget.defaults) {
            const defs = cloneDeep(Widget.defaults);
            itemOpts = merge({ ...defs, ...itemOpts }, defs, itemOpts);
            itemOpts.defaultsApplied = true;
        }

        itemOpts.border = cloneDeep(itemOpts.border);
        itemOpts.scrollbar = cloneDeep(itemOpts.scrollbar);
        itemOpts.style = cloneDeep(itemOpts.style);

        itemOpts = omit(itemOpts, 'widget');

        itemOpts = specialTerminalOptions(itemOpts);

        let opts;
        let item;

        opts = {
            ...itemOpts,
            key: this.options.key,
            gridIndex: this.options.gridIndex,
            tab: this.tab,
            itemKey,
            screen: this.screen,
            debug: this.debug.bind(this),
            parent: this,
            focused: false,
            left: 0,
            top: 0,
            width: `100%-2`,
            height: '100%-2',
            border: null,
            label: null,
            parentActivate: true,
        };

        let overrideLabel = false;
        let overrideBorder = false;

        if (itemOpts.border) {
            overrideBorder = { ...itemOpts.border };
            overrideBorder.bg = 'black';
            opts = omit(opts, 'border');
        }

        if (itemOpts.label) {
            overrideLabel = itemOpts.label;
            opts = omit(opts, 'label');
        }

        if (testFn(Widget)) {
            item = Widget(opts);
        } else {
            item = new Widget(opts);
        }





        item.panelGrid = this.gridActive;

        item.key = opts.key;

        item.itemKey = itemKey;
        item.maximized = this.maximized;
        item.panel = this;

        if (this.tab) {
            item.tab = this.tab;
        }

        if (this.parent.type === 'ui') {
            item.uiParent = this.parent;
        }

        if (item.type === 'grid' && item.options.label === 'Metrics') {
            this.containerDisabled.push('metrics');
        }

        if (item.type === 'markdown' || item.uiType === 'markdown') {
            this.readmeOpen.push(item.options.packageName);
        }

        item.on(
            'focus',
            function () {
                const self = this;

                setTimeout(function () {
                    if (
                        self === self.screen.focused &&
                        self.parent &&
                        self.parent.gridActive
                    ) {

                        self.parent.showItem(self, false, false, false);
                    }
                }, 25);
            }.bind(item)
        );

        item.on(
            'blur',
            function () {
                const self = this;
                setTimeout(function () {
                    if (
                        self !== self.screen.focused &&
                        self.parent &&
                        self.parent.gridActive &&
                        !self.switching
                    ) {

                        self.parent.onBlur(false);
                    }
                }, 25);
            }.bind(item)
        );


        item.on(
            'click',
            function (data) {
                if (
                    !this.popover &&
                    this.parent &&
                    this.parent.selected &&
                    this.parent.activeKey === 'main' &&
                    this === this.parent.mainItem &&
                    data.button === 'right'
                ) {
                    this.parent.emit('rightclick');
                }
            }.bind(item)
        );

        item.on('destroy', this.destroyItem.bind(this, itemKey));

        if (overrideBorder) {
            item.options.border = overrideBorder;
        }


        if (overrideLabel) {
            item.options.label = overrideLabel;

            item.__setLabel = item.setLabel.bind(item);

            item.setLabel = function (options) {
                if (!this.parent || this.destroyed) {
                    return;
                }

                const panel = this.parent;

                if (typeof options === 'string') {
                    options = { text: options, side: 'left' };
                }

                const panelLabel = panel.panelLabels[this.itemKey];

                if (panel.gridActive) {
                    this.__setLabel(options.text);
                } else {
                    if (this.itemKey === 'main') {
                        panel.updateMainLabel(options.text);
                    } else {
                        panelLabel.setContent(options.text);
                    }

                    panel.updateLabels();
                }

                if (panel.gridActive) {
                    panel.screen.render();
                } else {
                    panel.fullRender();
                }
            }.bind(item);
        }

        this.items[itemKey] = item;

        if (!this.activeKeys.includes(itemKey)) {
            this.activeKeys.push(itemKey);
        }

        if (overrideLabel) {
            this.addLabel(overrideLabel, itemKey);
        }

        if (this.gridActive) {
            this.gridCount = this.activeKeys.length + 1;
            this.prepGridItems(true, true);
        }

        this.append(item);

        if (item.activate && typeof item.activate === 'function') {
            (async () => {
                await item.activate(this);

                setTimeout(() => {
                    this.showItem(itemKey, !this.gridActive, itemKey !== 'main');
                }
                );
            })();
        } else {
            setTimeout(() =>
                this.showItem(itemKey, !this.gridActive, itemKey !== 'main')
            );
        }
    }

    destroyItem(itemKey) {
        // screen.userClose === true when the application is shutting down
        if (this.screen.userClose) {
            return;
        }

        if (
            this.items[itemKey] &&
            this.items[itemKey].type === 'grid' &&
            this.items[itemKey].options.label === 'Metrics'
        ) {
            this.containerDisabled = this.containerDisabled.filter(
                (dis) => dis !== 'metrics'
            );
        }

        if (
            this.items[itemKey] &&
            (this.items[itemKey].type === 'markdown' ||
                this.items[itemKey].uiType === 'markdown')
        ) {
            this.readmeOpen = this.readmeOpen.filter(
                (ro) => ro !== this.items[itemKey].options.packageName
            );
        }

        this.activeKeys = this.activeKeys.filter((k) => {
            return k !== itemKey;
        });

        let next;

        if (this.gridActive) {
            next = this.activeKeys.indexOf(itemKey) + 1;
        } else {
            next = this.activeKeys.indexOf(itemKey) - 1;
        }

        if (next < 0) {
            next = 0;
        } else if (next >= this.activeKeys.length) {
            next = this.activeKeys.indexOf(itemKey) - 1;
        }

        next = this.activeKeys[next < 0 ? 0 : next];
        this.showItem(next);

        if (this.panelLabels[itemKey]) {
            this.panelLabels[itemKey].free();
            this.panelLabels[itemKey].detach();
            this.panelLabels[itemKey].destroy();
        }

        const pLabels = {};

        for (const [key, label] of Object.entries(this.panelLabels)) {
            if (key !== itemKey) {
                pLabels[key] = label;
            }
        }

        this.panelLabels = pLabels;

        if (this.items[itemKey]) {
            this.items[itemKey].free();
            this.items[itemKey].detach();
        }

        const items = {};

        for (const [key, item] of Object.entries(this.items)) {
            if (key !== itemKey) {
                items[key] = item;
                items[key].refresh = true;
            }
        }

        this.items = items;

        if (this.actionHelp[itemKey]) {
            this.actionHelp[itemKey].free();
            this.actionHelp[itemKey].detach();
            this.actionHelp[itemKey].destroy();
        }

        const actionHelp = {};

        for (const [key, help] of Object.entries(this.actionHelp)) {
            if (key !== itemKey) {
                actionHelp[key] = help;
            }
        }
        this.actionHelp = actionHelp;

        process.nextTick(() => {
            this.updateLabels();
            if (this.gridActive) {
                this.screen.render();
            } else {
                this.fullRender();
            }

        });
    }
}

module.exports = ItemActions;
