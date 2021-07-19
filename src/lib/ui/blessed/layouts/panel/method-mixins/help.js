const blessed = require('blessed');
const chalk = require('chalk');
const stripAnsi = require('strip-ansi');
const memoize = require('lodash.memoize');

const chalkHex = memoize(chalk.hex);

class PanelHelp {
    get activeHelp() {
        return this.actionHelp[this.activeKey];
    }

    set activeHelp(value) {
        this.actionHelp[this.activeKey] = value;
    }

    updateHelp() {
        let dashColor = this.getDashColor();

        if (dashColor.includes('#')) {
            dashColor = chalkHex(dashColor);
        } else {
            dashColor = chalk[dashColor] ? chalk[dashColor] : chalk.greenBright;
        }

        const getKeyContent = (key, act, index, len, mark) => {
            const chalkAct = chalk.whiteBright;

            return `${key ? chalkHex('#00b2b3')(key) + ' ' : ''}${chalkAct(
                act
            )}${index + 1 < len ? dashColor(' ─ ') : ''}`;
        };

        for (const helpEl of Object.values(this.actionHelp)) {
            for (const child of helpEl.children) {
                child.setContent(
                    getKeyContent(
                        child.options.showKeys ? child.options.key : null,
                        child.options.act,
                        child.options.index,
                        child.options.len,
                        false
                    )
                );
            }
        }
    }

    addHelp(help, itemKey) {
        if (this.activeHelp) {
            this.activeHelp.show();
            this.activeHelp.setFront();

            return;
        }

        if (!this.items[itemKey]) {
            return;
        }

        const helpContainer = blessed.box({
            key: 'helpbox',
            parent: this.gridActive ? this.items[itemKey] : this,
            screen: this.screen,
            right: this.gridActive
                ? this.items[itemKey].right - (this.items[itemKey].iright - 1)
                : this.iright + 1,
            height: 1,
            shrink: true,
        });

        helpContainer._getPos = this._getPos.bind(helpContainer);

        helpContainer.itemKey = itemKey;

        helpContainer.abottom = this.gridActive
            ? this.items[itemKey].abottom - (this.items[itemKey].ibottom + 1)
            : this.abottom - 1;

        helpContainer.setFront();

        let lastHelp;

        let dashColor = this.getDashColor();

        if (dashColor.includes('#')) {
            dashColor = chalkHex(dashColor);
        } else {
            dashColor = chalk[dashColor] ? chalk[dashColor] : chalk.greenBright;
        }

        let len = Object.keys(help.keys).length;
        let index = 0;

        const getKeyContent = (key, act, index, len, mark) => {
            const chalkAct = chalk.whiteBright;

            return `${key ? chalkHex('#00b2b3')(key) + ' ' : ''}${chalkAct(
                act
            )}${index + 1 < len ? dashColor(' ─ ') : ''}`;
        };

        let showKeys = Array.isArray(help.keys)
            ? false
            : help.showKeys !== undefined
            ? help.showKeys
            : false;

        for (const [key, act] of Object.entries(help.keys)) {
            if (helpContainer.children[helpContainer.children.length - 1]) {
                lastHelp =
                    helpContainer.children[helpContainer.children.length - 1];
            }

            const helpBox = blessed.box({
                mouseFocus: false,
                action: stripAnsi(act),
                screen: this.screen,
                parent: helpContainer,
                content: getKeyContent(
                    showKeys ? key : null,
                    act,
                    index,
                    len,
                    false
                ),
                shrink: true,
                height: 1,
                left: lastHelp ? lastHelp.left + lastHelp.getText().length : 0,
                top: 0,
                showKeys,
                key,
                act,
                index,
                len,
                style: {
                    bg: 'black',
                    hover: {
                        italics: true,
                    },
                },
            });

            if (typeof key === 'string') {
                helpBox.on('click', () => {
                    if (
                        this.activeItem &&
                        this.screen.focused === this.activeItem
                    ) {
                    }
                    if (this.options.actions[key]) {
                        this.options.actions[key](
                            this.activeItem || this.mainItem,
                            this
                        );
                    } else if (
                        this.activeItem.options.actions &&
                        this.activeItem.options.actions[key]
                    ) {
                        this.activeItem.options.actions[key](this.activeItem);
                    } else {
                        this.screen.emit('keypress', null, { full: key });
                        if (
                            this.activeItem &&
                            this.screen.focused === this.activeItem
                        ) {
                            this.activeItem.emit(`key ${key}`, null, {
                                full: key,
                            });
                        }
                    }
                });
            }

            helpContainer.append(helpBox);

            helpBox.setFront();

            index++;
        }

        this.append(helpContainer);

        helpContainer.setFront();

        this.activeHelp = helpContainer;

        if (this.gridActive) {
            this.screen.render();
        } else {
            this.fullRender();
        }
    }
}

module.exports = PanelHelp;
