const { EventEmitter } = require('events');

/*
    I struggled with getting XTerm to work in a Terminal environment for a LONG time,
    until finally I just did the obvious thing and went through it's code and documented
    every call to DOM/Browser environment objects.

    Turns out it wasn't that many - this is all you need for XTerm to happily work in a Terminal setting,
    no JSDOM/Browser-env needed.
    */

class Window extends EventEmitter {
    constructor(options) {
        super(options);
        this.self = this;
    }

    addEventListener(event, fn) {
        return this.addListener(event, fn);
    }

    removeEventListener(event, fn) {
        return this.removeListener(event, fn);
    }

    requestAnimationFrame(callback) {
        return callback();
        /*     const now = new Date().getTime();
        const ttc = Math.max(0, 16 - now - this.lastTime);
        const timer = window.setTimeout(() => callback(now + ttc), ttc);
        this.lastTime = now + ttc;
        return timer;
        */
    }

    cancelAnimationFrame(timer) {
        clearTimeout(timer);
    }
}

global.window = new Window();

Object.getOwnPropertyNames(global.window).forEach((prop) => {
    global[prop] = global.window[prop];
});
