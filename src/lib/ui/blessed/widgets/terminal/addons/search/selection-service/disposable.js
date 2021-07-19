/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

class Disposable {
    constructor() {
        this._disposables = [];
        this._isDisposed = false;
    }

    dispose() {
        this._isDisposed = true;
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables.length = 0;
    }

    register(d) {
        this._disposables.push(d);
        return d;
    }

    unregister(d) {
        const index = this._disposables.indexOf(d);
        if (index !== -1) {
            this._disposables.splice(index, 1);
        }
    }
}

function disposeArray(disposables) {
    for (const d of disposables) {
        d.dispose();
    }
    disposables.length = 0;
}

function getDisposeArrayDisposable(array) {
    return { dispose: () => disposeArray(array) };
}

module.exports = {
    Disposable,
    disposeArray,
    getDisposeArrayDisposable,
};
