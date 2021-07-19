const blessed = require('blessed');

// The state of the 'UI Logger' terminal, which reflects the state of the docker container, needs to be communicated to sub-panel terminals
// Tacking that data onto Screen and using having Terminals subscribe to events emitted by Screen seemed like the easiest option.
blessed.Screen.prototype.terminalState = function (term, active) {
    this.terminals = this.terminals || new Map();

    const id = term.id || term.options.id;
    let newTerm = true;
    let state = null;

    if (this.terminals.has(id)) {
        newTerm = false;
        state = this.terminals.get(id);
    }

    let change = '';

    if (newTerm && active) {
        change = 'started';
    } else if (state) {
        if (state.active && !active) {
            change = 'exited';
        } else if (!state.active && active) {
            change = 'restarted';
        }
    }

    if (change === '') {
        return;
    }

    state = state || {
        id,
        pty: term.options.pty,
        key: term.options.key,
        itemKey: term.options.itemKey,
        active,
        change,
        exitingTimeout: null,
        watchTerm: term.options.watchTerm,
    };

    state.active = active;
    state.change = change;

    this.terminals.set(id, state);

    if (newTerm) {
        term.on('destroy', () => {
            this.terminals.delete(id);
        });
    }

    (function emit(el) {
        el.emit('terminal state', state, change, active);
        el.children.forEach(emit);
    })(this);
};
