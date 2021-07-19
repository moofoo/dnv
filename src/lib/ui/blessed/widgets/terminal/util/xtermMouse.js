const CoreMouseButton = {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2,
    NONE: 3,
    WHEEL: 4,
};

const CoreMouseAction = {
    UP: 0, // buttons, wheel
    DOWN: 1, // buttons, wheel
    LEFT: 2, // wheel only
    RIGHT: 3, // wheel only
    MOVE: 32, // buttons only
};

const buttonMap = Object.keys(CoreMouseButton).reduce((acc, curr) => {
    return {
        ...acc,
        [CoreMouseButton[curr]]: curr,
    };
});

const actionMap = Object.keys(CoreMouseAction).reduce((acc, curr) => {
    return {
        ...acc,
        [CoreMouseAction[curr]]: curr,
    };
});

const getButton = (key) => {
    const { button, action } = key;

    if (['mousedown', 'mouseup'].includes(action)) {
        if (button === 'middle') {
            return CoreMouseButton.MIDDLE;
        } else if (button === 'left') {
            return CoreMouseButton.LEFT;
        } else if (button === 'right') {
            return CoreMouseButton.RIGHT;
        }
    }

    if (['wheelup', 'wheeldown'].includes(action)) {
        return CoreMouseButton.WHEEL;
    }

    return CoreMouseButton.NONE;
};

const getAction = (key) => {
    const { action } = key;

    if (action === 'mousemove') {
        return CoreMouseAction.MOVE;
    }

    if (['mousedown', 'mouseup', 'wheeldown', 'wheelup'].includes(action)) {
        if (action.includes('up')) {
            return CoreMouseAction.UP;
        } else {
            return CoreMouseAction.DOWN;
        }
    }
};

const getMouseEvent = (key) => {
    let { ctrl, meta: alt, shift, x, y, row, col } = key;

    row = row || y;
    col = col || x;
    key.row = row;
    key.col = col;

    const button = getButton(key);

    const action = getAction(key);

    return { col, row, button, action, ctrl, alt, shift };
};

const translateMouseEvent = (event) => {
    return {
        ...event,
        button: buttonMap[event.button],
        action: actionMap[event.action],
    };
};

const Modifiers = {
    SHIFT: 4,
    ALT: 8,
    CTRL: 16,
};

function eventCode(e, isSGR) {
    let code =
        (e.ctrl ? Modifiers.CTRL : 0) |
        (e.shift ? Modifiers.SHIFT : 0) |
        (e.alt ? Modifiers.ALT : 0);
    if (e.button === CoreMouseButton.WHEEL) {
        code |= 64;
        code |= e.action;
    } else {
        code |= e.button & 3;
        if (e.button & 4) {
            code |= 64;
        }
        if (e.button & 8) {
            code |= 128;
        }
        if (e.action === CoreMouseAction.MOVE) {
            code |= CoreMouseAction.MOVE;
        } else if (e.action === CoreMouseAction.UP && !isSGR) {
            // special case - only SGR can report button on release
            // all others have to go with NONE
            code |= CoreMouseButton.NONE;
        }
    }
    return code;
}

const S = String.fromCharCode;

const getDefaultCode = (key, term) => {
    const e = getMouseEvent(key);
    const params = [eventCode(e, false) + 32, e.col + 32, e.row + 32];
    // supress mouse report if we exceed addressible range
    // Note this is handled differently by emulators
    // - xterm:         sends 0;0 coords instead
    // - vte, konsole:  no report
    if (params[0] > 255 || params[1] > 255 || params[2] > 255) {
        return '';
    }

    if (
        e.col < 0 ||
        e.col >= term._core._bufferService.cols ||
        e.row < 0 ||
        e.row >= term._core._bufferService.rows
    ) {
        return false;
    }

    // filter nonsense combinations of button + action
    if (
        e.button === CoreMouseButton.WHEEL &&
        e.action === CoreMouseAction.MOVE
    ) {
        return false;
    }
    if (
        e.button === CoreMouseButton.NONE &&
        e.action !== CoreMouseAction.MOVE
    ) {
        return false;
    }
    if (
        e.button !== CoreMouseButton.WHEEL &&
        (e.action === CoreMouseAction.LEFT ||
            e.action === CoreMouseAction.RIGHT)
    ) {
        return false;
    }

    e.col++;
    e.row++;

    return `\x1b[M${S(params[0])}${S(params[1])}${S(params[2])}`;
};

const getSGRCode = (key) => {
    const e = getMouseEvent(key);
    const final =
        e.action === CoreMouseAction.UP && e.button !== CoreMouseButton.WHEEL
            ? 'm'
            : 'M';
    return `\x1b[<${eventCode(e, true)};${e.col};${e.row}${final}`;
};

module.exports = {
    translateMouseEvent,
    getMouseEvent,
    getDefaultCode,
    getSGRCode,
};
