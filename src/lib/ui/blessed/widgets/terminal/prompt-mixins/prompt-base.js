const blessed = require('blessed');

class PromptBase {
    initializer() {
        this.promptOpen = false;
        this.switching = false;
    }

    promptContainer(label) {
        let create = true;

        if (this.pContainer) {
            create = false;
        }

        const { top, left, width, height } = this.parent.listBarCoords;

        this.pContainer =
            this.pContainer ||
            blessed.box({
                parent: this.screen,
                top,
                left,
                width,
                height,
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
                },

                padding: {
                    left: 2,
                },
            });

        this.pLabel =
            this.pLabel ||
            blessed.box({
                containerLabel: true,
                parent: this.pContainer,
                valign: 'center',
                left: 0,
                width: label.length + 1,
                height: 1,
                top: 'center',
                style: {
                    fg: 'brightcyan',
                },
            });

        this.pLabel.lastLabel = label;

        this.pLabel.setContent(`${label}: `);

        return create;
    }
}

module.exports = PromptBase;
