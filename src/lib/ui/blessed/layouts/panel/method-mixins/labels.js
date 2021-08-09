const blessed = require('blessed');
const chalk = require('chalk');
const memoize = require('lodash.memoize');

const chalkHex = memoize(chalk.hex);

class PanelLabels {
    addLabel(text, itemKey = 'main') {
        if (!this.panelLabels[itemKey]) {
            const labelCount = this.activeKeys.length;

            let content = this.getLabelContent(itemKey, text, true);

            const label = blessed.box({
                mouseFocus: false,
                key: this.options.key + 'Label',
                screen: this.screen,
                parent: this,
                content,
                top: -this.itop,
                tags: true,
                shrink: true,
                clickable: true,
                style: {
                    bg: 'black',
                    fg: 7,
                },
            });

            label.ogText = text;

            label.on('click', () => {
                this.showItem(itemKey, true);
            });

            label._getPos = this._getPos.bind(label);

            label.itemKey = itemKey;

            label._isLabel = true;

            if (!this.screen.autoPadding) {
                label.rtop = 0;
            }

            if (labelCount > 0) {
                let length = 0;
                for (const key of this.activeKeys) {
                    const panelLabel = this.items[key].panelLabel;
                    if (panelLabel) {
                        length += panelLabel.getText().length;
                    }
                }

                label.left = 1 + length;
            } else {
                label.rleft = 2 - this.ileft;
            }

            this.panelLabels[itemKey] = label;

            process.nextTick(() => {
                if (label) {
                    label.setFront();
                }
                this.updateLabels();
            });
        }
    }

    getLabelContent(itemKey, text, active = false) {
        if (itemKey === 'main') {
            return text;
        }

        const chalkFn =
            active || this.activeKey === itemKey
                ? this.items[itemKey] &&
                    (this.items[itemKey].focused ||
                        (itemKey !== 'main' && this.items[itemKey].selected))
                    ? chalkHex('#f9ff00')
                    : chalkHex('#a77a0f')
                : chalkHex('#9d9d9d');

        const plabel = this.panelLabels[itemKey];

        if (!text) {
            if (plabel) {
                text = plabel
                    .getText()
                    .replace(/\s*─\s*/g, '')
                    .replace(/^( )+/g, '')
                    .replace(/( )+$/g, '');
            }
        }

        if (this.gridActive) {
            text = text
                .replace(/\s*─\s*/g, '')
                .replace(/^( )+/g, '')
                .replace(/( )+$/g, '');
            return chalkFn(text);
        }



        let dashColor = this.getDashColor();

        if (dashColor.includes('#')) {
            dashColor = chalkHex(dashColor);
        } else {
            dashColor = chalk[dashColor] ? chalk[dashColor] : chalk.greenBright;
        }

        return ` ${dashColor('─')} ${chalkFn(text)}`;
    }

    updateLabels() {
        let length = this.mainItem
            ? this.panelLabels['main'] &&
            this.panelLabels['main'].getText().length
            : 0;

        for (const [index, plabel] of this.activeLabels.entries()) {

            if (this.gridActive) {

                plabel.hide();
            }


            if (plabel.itemKey !== 'main') {


                plabel.left = 1 + length;

                const labelContent = this.getLabelContent(plabel.itemKey);

                plabel.setContent(labelContent);

                length += plabel.getText().length;
            }
        }

    }

    updateMainLabel(text) {
        const mainLabel = this.panelLabels['main'];
        const mainItem = this.items['main'];

        if (mainLabel && mainItem) {
            text = text || mainLabel.getText();

            mainLabel.setText(text);

            if (
                this.selected &&
                (this.activeItem === mainItem ||
                    mainItem.focused ||
                    mainItem.promptOpen)
            ) {
                mainLabel.style.fg = 15;
            } else if (this.selected) {
                mainLabel.style.fg = '#dbdbdb';

                /*      const split = text.split(' ');

                if (split.length > 1) {
                    mainLabel.setContent(
                        split[0] +
                            ' ' +
                            chalkHex('#dbdbdb')(split.slice(1).join(' '))
                    );
                } else {
                    mainLabel.setContent(chalkHex('#00d7ff')(text));
                }*/
            } else {
                mainLabel.style.fg = '#adadad';
            }
        }
    }
}

module.exports = PanelLabels;
