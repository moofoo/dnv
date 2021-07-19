const blessed = require('blessed');
const merge = require('lodash.merge');
const UI = require('../layouts/ui');

class WritePrompt extends blessed.List {
    constructor(opts = {}) {
        const height = opts.positionParent.height - 9 <= 4 ? 9 : '100%-9';

        const options = merge(
            {},
            {
                label: 'Actions',
                align: 'center',
                left: 'center',
                top: 1,
                left: 2,
                width: 35,
                height,
                loop: true,
                mouse: true,
                keys: true,
                interactive: true,
                focused: false,
                scrollable: true,
                shadow: true,
                insideWheel: false,
                outsideClick: true,
                outsideMove: ['inside'],
                outsideMoveBlurred: true,
                borderMark: true,
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

        this.grabMouse = true;
        this.grabKeys = true;

        this.screen._listenMouse(this);

        this.loading = true;

        this.align = this.options.itemAlign || 'right';

        this.itemOpts = this.options.itemOpts;

        this.write = this.options.writer.write.bind(this.options.writer);

        this.panel = this.options.panel;
        this.subPanel = this.options.subPanel;

        if (!this.panel && this.subPanel.parent) {
            this.panel = this.subPanel.parent;
        }

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

        screen.grabMouse = true;
        screen.grabKeys = true;
        screen.promptOpen = true;

        this.setItems(this.itemOpts);

        this.focus();

        this.select(this.options.startSelection || 0);

        this.emit('resize');

        this.screen.render();

        setTimeout(() => {
            this.focus();
        });
    }

    initWritePromptEvents() {
        const screen = this.screen;
        const panel = this.panel;

        this.on('destroy', () => {
            this.grabMouse = false;
            this.grabKeys = false;
            this.exiting = true;
            this.options.positionParent = null;

            screen.grabMouse = false;
            screen.grabKeys = false;
            screen.promptOpen = false;

            this.hide();
            screen.render();

            panel.popover = false;
            panel.switching = false;

            process.nextTick(() => {
                if (panel.selected) {
                    panel.focus();
                }

                screen.render();
            });
        });

        setTimeout(() => {
            this.key('escape', () => {
                this.destroy();
            });

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
                }, 50);
            });

            this.on('keypress', (ch, key) => {
                if (
                    ['M-left', 'M-right', 'M-up', 'M-down', 'escape'].includes(
                        key.full
                    )
                ) {
                    this.destroy();
                }
            });

            this.selecting = false;

            this.on('select', async (item, index, data) => {
                if (this.loading || this.selecting || this.exiting) {
                    return;
                }

                const { sequence, name } = data;

                if (!sequence) {
                    this.destroy();
                    return;
                }

                this.selecting = true;

                this.removeAllListeners('select');

                this.hide();

                this.panel.switching = true;

                this.screen.render();

                this.write(sequence);

                this.exiting = true;

                process.nextTick(() => {
                    this.destroy();
                });
            });
        }, 125);
    }
}

module.exports = WritePrompt;
