/*module.exports.throttle = (el) => {
    el.removeAllListeners('wheeldown');
    el.removeAllListeners('wheelup');

    let delta = 0,
        tick = false;

    const scroll = function (d) {
        delta += d;
        if (!tick) {
            setTimeout(function () {
                if (delta != 0 && !el.detached) {
                    el.scroll(delta);
                    delta = 0;
                    el.screen.render();
                }
                tick = false;
            }, 20);
            tick = true;
        }
    };

    el.on('wheeldown', (_) =>
        el.maximized && !el.panelGrid ? scroll(2) : scroll(1)
    );
    el.on('wheelup', (_) =>
        el.maximized && !el.panelGrid ? scroll(-2) : scroll(-1)
    );

    return el;
};
*/

const throttle = function (el) {
    el.removeAllListeners('wheeldown');
    el.removeAllListeners('wheelup');

    let delta = 0,
        tick = false;

    const deltaScroll = function (d) {
        delta += d;
        if (!tick) {
            setTimeout(function () {
                if (delta != 0 && !el.detached) {
                    el.scroll(delta);
                    delta = 0;
                    el.screen.render();
                }
                tick = false;
            }, 20);
            tick = true;
        }
    };

    el.on('wheeldown', (_) =>
        el.maximized && !el.panelGrid ? deltaScroll(2) : el.scroll(1)
    );
    el.on('wheelup', (_) =>
        el.maximized && !el.panelGrid ? deltaScroll(-2) : el.scroll(-1)
    );

    return el;
};

module.exports = throttle;
