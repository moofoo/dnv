const blessed = require('blessed');
const merge = require('lodash.merge');
const UI = require('../layouts/ui');

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

class ContainerOpts extends blessed.List {
    constructor(opts) {
        const options = merge(
            {},
            {
                label: 'Actions',
                align: 'center',
                left: 'center',
                top: 1,
                left: 2,
                shadow: true,
                mouse: true,
                keys: true,
                interactive: true,
                insideWheel: false,
                outsideClick: true,
                focused: false,
                loop: true,
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
                        fg: 'cyan',
                        bold: true,
                        underline: true,
                    },
                    fg: 'white',
                },
            },
            opts
        );

        super(options);

        this.align = this.options.align || 'center';

        this.optItems = this.options.items.filter(onlyUnique);
        this.action = this.options.action;
        this.panel = this.options.panel;
        this.subPanel = this.options.subPanel;

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
        const subPanel = this.subPanel;

        panel.switching = true;

        UI.hideCursor(screen);

        this.grabMouse = true;
        this.grabKeys = true;

        this.value = undefined;
        screen.grabMouse = true;
        screen.grabKeys = true;
        screen.promptOpen = true;

        const disabled = this.panel.containerDisabled || [];

        if (disabled.length) {
            this.optItems = this.optItems.filter(
                (oi) => !disabled.includes(oi)
            );
        }
        this.setItems(this.optItems);

        this.on('destroy', () => {
            this.grabMouse = false;
            this.grabKeys = false;
            this.exiting = true;
            this.options.positionParent = null;

            this.hide();

            if (!this.switching) {
                screen.grabMouse = false;
                screen.grabKeys = false;
                screen.promptOpen = false;

                panel.popover = false;
                panel.switching = false;
                subPanel.popover = false;

                if (subPanel.termRender) {
                    subPanel.termRender(false, true);
                }
            }

            process.nextTick(() => {
                if (panel.selected && !this.switching) {
                    panel.focus();
                }

                screen.render();
            });
        });

        setTimeout(() => {
            this.on('out-click', (data) => {
                if (data.button === 'left') {
                    this.destroy();
                }
            });

            this.on('blur', () => {
                setTimeout(() => {
                    let destroy = true;
                    for (const child of this.children) {
                        if (child === this.screen.focused) {
                            destroy = false;
                        }
                    }

                    if (destroy) {
                        this.destroy();
                    }
                }, 100);
            });

            this.on('keypress', (ch, key) => {
                if (
                    [
                        'C-left',
                        'C-right',
                        'C-up',
                        'C-down',
                        'C-S-left',
                        'C-S-right',
                        'C-S-up',
                        'C-S-down',
                        'M-left',
                        'M-right',
                        'M-up',
                        'M-down',
                        'escape',
                    ].includes(key.full)
                ) {
                    if (
                        ['C-left', 'C-right', 'C-up', 'C-down', 'C-S-left',
                            'C-S-right',
                            'C-S-up',
                            'C-S-down',].includes(
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

            let selected = false;

            this.on('select', () => {
                if (selected) {
                    return;
                }

                if (this.value === '') {
                    return;
                }

                if (!this.value) {
                    this.value = this.optItems[0];
                }

                selected = true;

                this.hide();

                if (this.options.subLists.includes(this.value)) {
                    this.switching = true;
                }

                this.panel.switching = true;

                this.screen.render();

                this.action(this.value);
                this.destroy();
            });
        }, 125);

        this.panel.popover = true;

        if (this.subPanel.termRender) {
            this.subPanel.popoverCoords = this._getCoords(true);
        }

        this.focus();

        this.select(0);

        this.screen.render();

        setTimeout(() => {
            this.focus();
        });
    }
}

module.exports = ContainerOpts;
