const blessed = require('blessed');
const chalk = require('chalk');
const { chalkSubStr } = require('../util/prettify');

const helperText = (whole, part) => {
    return chalkSubStr(
        chalk.italic.white,
        chalk.italic.hex('#f59324').bold,
        whole,
        part
    );
};

let top = -2;

const heading = (parent, name) => {
    top += 1;
    blessed.box({
        parent,
        top,
        left: 0,
        width: '75%',
        height: 2,
        content: name,
        style: {
            fg: 'default',
            underline: true,
        },
    });
};

const command = (parent, name, cmd) => {
    top += 1;
    blessed.box({
        parent,
        top,
        left: 0,
        width: cmd ? '50%' : '90%',
        content: name,
        style: {
            fg: 'cyan',
        },
    });

    if (cmd) {
        blessed.box({
            parent,
            top,
            left: '50%',
            content: cmd,
        });
    }
};

const gridHelp = (screen) => {
    const container = blessed.box({
        outsideClick: true,
        mouseFocus: false,
        clickable: true,
        screen,
        parent: screen,
        label: 'Command Help',
        top: 'center',
        left: 'center',
        width: 135,
        height: 31,
        border: {
            type: 'line',
            fg: 'red',
        },
        style: {
            bg: 'black',
            fg: 'default',
        },
        padding: 2,
    });

    const left = blessed.box({
        parent: container,
        top: 0,
        left: 0,
        width: 90,
    });

    const middle = blessed.box({
        parent: container,
        top: 0,
        width: 55,
        left: 73,
    });

    top = -2;

    heading(left, 'General UI');
    command(left, 'Exit UI', 'Ctrl + q');
    command(left, 'Select Service Panel', 'Ctrl + Direction');
    command(left, 'Select Service Sub-Panel', 'Alt + Direction');
    command(left, 'Close/Exit Sub-Panel', 'Ctrl + z');
    command(left, 'Maximize Panel', 'Alt + x');
    command(left, 'Display Log and Sub-Panels in a Grid', 'Alt + Shift + x');
    command(left, 'Minimize Panel / Close Sub-Panel Grid', 'Alt + x');
    command(left, 'Next Services Page', 'Ctrl + Shift + Right');
    command(left, 'Prev Services Page', 'Ctrl + Shift + Left');
    command(left, 'Select Services Page', 'F1 -> F8');
    command(left, 'Scroll Up Log', 'Up, Shift-Up, Page-Up');
    command(left, 'Scroll Down Log', 'Down, Shift-Down, Page-Down');
    command(left, 'Scroll to Start of Log', 'Home');
    command(left, 'Scroll to End of Log', 'End');

    top += 1;

    heading(left, 'Searching');
    command(left, 'Submit / Cancel', 'Enter / Escape');
    command(left, 'Clear prompt', 'Ctrl + x');
    command(left, 'Cycle prior searches', 'Ctrl + Up / Down');
    command(left, 'Find next match', 'Down');
    command(left, 'Find previous match', 'Up');
    command(left, 'Find first match', 'Ctrl + Home');
    command(left, 'Find last match', 'Ctrl + End');

    top = -2;

    heading(middle, 'Filtering');
    command(middle, 'Submit / Cancel', 'Enter / Escape');
    command(middle, 'Clear prompt', 'Ctrl + x');
    command(middle, 'Cycle prior filters', 'Ctrl + Up / Down');
    command(middle, 'Clear filter', 'Ctrl + g');

    top += 1;

    heading(middle, 'Exec / Scripts');
    command(middle, 'Run list selection', 'Enter');
    command(middle, 'Show arguments input', 'Space');

    top += 1;

    heading(middle, `Panel Actions (like ${helperText('Action', 'A')})`);
    command(middle, 'Run Action', 'Ctrl + indicated letter');

    top += 1;

    heading(middle, `REPL / Shell Scrolling`);
    command(middle, 'Scroll', 'Page-Up, Page-Down');
    command(middle, 'Faster Scroll', 'PgUp/PgDwn + Shift/Ctrl/Alt');

    top += 1;

    heading(middle, `Mouse (on Linux)`);

    command(middle, 'Scroll with mousewheel');
    command(middle, 'Drag-select text, copy to clipboard with Ctrl+C');
    command(middle, 'Dbl Click', 'Select Word');
    command(middle, 'Triple Click', 'Select Line');
    command(middle, 'Incremental Select', 'Ctrl + Left Button');
    command(middle, 'Move Cursor (if visible)', 'Alt + Left Button');
    command(middle, 'Open Actions Menu', 'Right click in focused panel');

    return container;
};

const help = (screen, layout, closeCb) => {
    top = -2;

    const container = gridHelp(screen);
    container.grabMouse = true;

    container.setFront();

    const grabKeys = screen.grabKeys;

    screen.grabMouse = true;
    screen.grabKeys = true;

    layout.children.forEach((child) => {
        child.freeze = true;
    });

    screen.focusEmit = container;

    let closing = false;

    const closeContainer = () => {
        if (closing) {
            return;
        }

        closing = true;

        container.children.forEach((child) => {
            if (child.children.length) {
                child.children.forEach((schild) => {
                    schild.hide();
                    schild.destroy();
                });
            }

            child.hide();
            child.destroy();
        });

        container.hide();
        container.destroy();

        screen.render();

        closeCb();

        setTimeout(() => {
            screen.grabKeys = grabKeys;
            screen.grabMouse = false;
            screen.focusEmit = false;
            layout.processKeys = true;

            layout.children.forEach((child) => {
                child.freeze = false;
            });
        });
    };

    container.once('keypress', () => {
        closeContainer();
    });

    container.once('click', () => {
        closeContainer();
    });

    container.once('out-click', () => {
        closeContainer();
    });

    screen.append(container);

    setTimeout(() => {
        layout.processKeys = false;

        screen.render();
    });
};

module.exports = help;
