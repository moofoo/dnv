const UI = require('../../../layouts/ui');
const blessed = require('blessed');
const clipboardy = require('clipboardy');

let all;
let visible;
let container;

class CopyPrompt {
    initializer() {
        this.copyPromptOpen = false;
        this.key(this.options.copyKey || 'C-p', () => this.openCopyPrompt());

        this.onMouseDown = this.onMouseDown.bind(this);
    }

    cleanUp() {
        all.destroy();
        visible.destroy();
        container.destroy();

        this.screen.off('mouseup', this.onMouseDown);

        if (!this.promptOpen) {
            this.freeze = false;
            this.parentEmit('prompt close');
            this.focus();
            this.copyPromptOpen = false;
        } else {
            this.copyPromptOpen = false;
            this.pContainer.show();
            this.filterPrompt.focus();
        }

        if (this.updateLabelAndStyle) {
            this.updateLabelAndStyle();
        }
        this.termRender(true);
    }

    onMouseDown(key) {
        const { x, y } = key;

        if (x && y) {
            if (!all.isInside(x, y) && !visible.isInside(x, y)) {
                this.cleanUp();
            }
        }
    }

    copyAllLines(filtered = false) {
        this.selectionService.selectAll(false);
        clipboardy.writeSync(this.selectionText.trimRight());
        this.clearSelection();
    }

    copyVisibleLines(filtered = false) {
        const dim = this.dimensions;

        this.selectionService.selectLines(
            dim.viewportY,
            dim.viewportY + dim.viewportRows - 1,
            false
        );

        clipboardy.writeSync(this.selectionText.trimRight());
        this.clearSelection();
    }

    openCopyPrompt() {
        if (this.copyPromptOpen && !this.promptOpen) {
            return;
        }

        const { top, left, width, height } = this.parent.listBarCoords;

        container = blessed.box({
            parent: this.screen,
            top,
            left,
            width,
            height,
            border: {
                type: 'line',
                fg: 'brightblue',
                bg: 'black',
            },

            padding: {
                left: 2,
            },
        });

        const cLabel = blessed.box({
            containerLabel: true,
            parent: container,
            content: 'Copy: ',
            valign: 'center',
            left: 0,
            width: 5,
            height: 1,
            top: 'center',
            style: {
                fg: 'brightcyan',
                bg: 'black',
            },
        });

        visible = blessed.box({
            parent: container,
            top: 'center',
            clickable: true,

            align: 'center',
            valign: 'center',
            content: 'visible lines',
            height: 3,
            width: 15,
            left: 6,

            border: {
                type: 'line',
                fg: 'blue',
            },
            style: {
                fg: 'brightcyan',
                focus: {
                    bg: 'red',
                },
            },
        });

        all = blessed.box({
            parent: container,
            content: 'all lines',
            height: 3,
            left: 21,
            width: 12,
            clickable: true,
            align: 'center',
            valign: 'center',
            top: 'center',
            border: {
                type: 'line',
                fg: 'blue',
            },
            style: {
                fg: 'brightcyan',
                focus: {
                    bg: 'red',
                },
            },
        });

        visible.on('focus', () => {
            UI.hideCursor(this.screen);

            if (!this.promptOpen) {
                this.freeze = true;
            }
        });

        const onSelection = (copyAll = true) => {
            all.hide();
            visible.hide();

            if (copyAll !== undefined) {
                cLabel.width += 2;
                cLabel.setContent('Copied!');
                this.termRender(true);
            }

            if (copyAll) {
                this.copyAllLines(this.promptOpen);
            } else if (copyAll === false) {
                this.copyVisibleLines(this.promptOpen);
            }

            setTimeout(() => this.cleanUp(), 1000);
        };

        visible.on('keypress', (ch, key) => {
            if (['left', 'right'].includes(key.full)) {
                all.focus();
            } else if (['enter', 'return'].includes(key.name)) {
                onSelection(false);
            } else if (key.full === 'escape') {
                onSelection(null);
            }
        });

        visible.on('mouseup', () => {
            setTimeout(() => {
                onSelection(false);
            });
        });

        all.on('keypress', (ch, key) => {
            if (['left', 'right'].includes(key.full)) {
                visible.focus();
            } else if (['enter', 'return'].includes(key.name)) {
                onSelection(true);
            } else if (key.full === 'escape') {
                onSelection(null);
            }
        });

        all.on('mouseup', () => {
            setTimeout(() => {
                onSelection(true);
            });
        });

        visible.on('mouseover', () => {
            visible.focus();
        });

        all.on('mouseover', () => {
            all.focus();
        });

        visible.key('C-c', () => {
            all.destroy();
            visible.destroy();
            container.destroy();
            this.freeze = false;
            this.copyPromptOpen = false;
        });

        all.key('C-c', () => {
            all.destroy();
            visible.destroy();
            container.destroy();
            this.freeze = false;
            this.copyPromptOpen = false;
        });

        setTimeout(() => {
            this.screen.on('mouseup', this.onMouseDown);
        });

        visible.focus();

        this.screen.append(container);

        this.parentEmit('prompt open');

        this.termRender(true);

        this.copyPromptOpen = true;
    }
}

module.exports = CopyPrompt;
