const blessed = require('blessed');
const UI = require('../layouts/ui');

let promptOpen = false;

const closePrompt = (screen, layout, cb) => {
    if (promptOpen) {
        return;
    }

    const { top, left, width, height } = layout.listBar.position;

    promptOpen = true;

    screen.exitOpen = true;

    const label = 'Are you sure?';

    const container = blessed.box({
        parent: screen,
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
        keyable: true,
    });

    const labelBox = blessed.box({
        parent: container,
        valign: 'center',
        left: 0,
        width: label.length + 1,
        height: 1,
        content: label,
        top: 'center',
        style: {
            fg: 'brightred',
            bg: 'black',
        },
    });

    const yes = blessed.box({
        parent: container,
        top: 'center',
        align: 'center',
        valign: 'center',
        content: 'Yes',
        height: 1,
        width: 5,
        left: label.length + 1,
        style: {
            fg: 'brightcyan',
            bg: 'black',
        },
        keyable: true,
    });

    const grabKeys = screen.grabKeys;
    screen.grabKeys = true;

    screen.focusEmit = yes;

    const no = blessed.box({
        parent: container,
        content: 'No',
        height: 1,
        left: 20,
        width: 5,
        align: 'center',
        valign: 'center',
        top: 'center',

        style: {
            fg: 'brightcyan',
            bg: 'black',
        },
    });

    const done = (confirmedClose) => {
        yes.destroy();
        no.destroy();
        labelBox.destroy();
        container.destroy();

        screen.render();

        if (!confirmedClose) {
            if (screen.promptOpen) {
                screen.restoreFocus();
            } else {
                layout.getFocusedItem().focus();
            }

            layout.emit('prompt close');

            process.nextTick(() => {
                screen.exitOpen = false;
                promptOpen = false;
                screen.focusEmit = false;
                screen.grabKeys = grabKeys;
            });
        } else {
            screen.focusEmit = false;
            screen.grabKeys = grabKeys;
            screen.render();

            cb();

            if (screen) {
                screen.render();
            }
        }
        screen.render();
    };

    yes.on('keypress', (ch, key) => {
        if (['enter', 'return', 'y'].includes(key.full)) {
            done(true);
        } else {
            done(false);
        }
        screen.render();
    });

    yes.focus();

    screen.append(container);

    process.nextTick(() => {
        layout.emit('prompt open');
        yes.focus();
        UI.hideCursor(screen);
    });

    screen.render();
};

module.exports = closePrompt;
