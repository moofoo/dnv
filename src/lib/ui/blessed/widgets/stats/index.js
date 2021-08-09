const blessed = require('blessed');
const MetricsProvider = require('./lib/metrics');
const Graph = require('./lib/graph');
const map = require('lodash.map');
const debounce = require('lodash.debounce');
const getColor = require('./lib/color');

const NetClient = require('./lib/net-client');
const aggregation = require('aggregation/es6');

class Stats extends blessed.Box {
    constructor(opts) {
        const options = {
            ...opts,
            focusParent: true,
        };

        super(options);

        this.host = this.options.host;
        this.port = this.options.port;
        this.key = this.options.key;

        this.watchTerm = this.options.watchTerm;

        this.onTerminalState = this.onTerminalState.bind(this);

        this.metricsProvider = new MetricsProvider(this);
        this.metricsProvider.debug = this.options.debug;

        this.rendered = false;

        this.mouseDown = false;
        this.mouseData = null;

        this.resize = this.resize.bind(this);

        this.dragInterval = null;
        this.onDrag = this.onDrag.bind(this);

        this.debouncedResize = debounce(this.resize, 150, {
            leading: false,
            trailing: true,
        });

        this.lineSeries = this.options.metrics.reduce((acc, curr) => {
            return {
                [curr]: {
                    label: this.options.labels[curr],
                    color: getColor(curr),
                },
                ...acc,
            };
        }, {});

        this.initStatsEvents();

        this._border = { ...this.border };



    }


    get freeze() {
        if (this.lineGraph) {
            return this.lineGraph.freeze;
        }
        return false;
    }

    set freeze(value) {
        if (this.lineGraph) {
            this.lineGraph.freeze = value;
        }
    }

    get uiType() {
        return 'metrics';
    }

    async activate() {
        this.lineGraph = new Graph({
            debug: this.debug.bind(this),
            metrics: this.options.metrics,
            metricsProvider: this.metricsProvider,
            nonZero: this.options.nonZero || [],
            parent: this,
            showLegend: false,
            title: '',
            label: '',
            screen: this.screen,
            style: { baseline: 'white', line: 'white' },
            unit: this.options.unit || '%',
            maxY: this.options.maxY || 103,
            numYLabels: 4,
            series: this.lineSeries,
            heightOffset: this.options.heightOffset,
            yPadding: this.options.yPadding,
            yLabelPadding: this.options.yLabelPadding,
            labelOffset: this.options.labelOffset,
            align: this.options.align,
            limit: 60,
            showXAxis: this.options.showXAxis,
            onEvent: function (data, discardEvent) {
                if (discardEvent || this.freeze) {
                    return;
                }

                const metrics = this.options.metrics.reduce((acc, curr) => {
                    let metric = data.metrics[curr];
                    let num = Number(metric);

                    if (this.options.nonZero.length) {
                        if (
                            this.lastMetrics &&
                            this.lastMetrics[curr] !== undefined
                        ) {
                            if (
                                (isNaN(num) || num === 0) &&
                                this.options.nonZero.includes(curr)
                            ) {
                                metric = this.lastMetrics[curr];
                            }
                        }
                    }

                    if (num > 0 && this.lastMetrics) {
                        this.lastMetrics[curr] = metric;
                    }

                    return {
                        [curr]: metric,
                        ...acc,
                    };
                }, {});

                this.update(metrics);
            },
            onRefreshMetrics: function () {
                if (this.freeze) {
                    return;
                }

                const metrics = this.options.metrics;
                const mapper = rows => {
                    return map(rows, row => {
                        return metrics.reduce((acc, curr) => {
                            return {
                                [curr]: row.metrics[curr],
                                ...acc,
                            };
                        }, {});
                    });
                };

                this.refresh(mapper);
            },
        });

        if (this.activateNext) {
            await this.activateNext(this.options);
        }
    }

    resize() {
        if (this.parent && !this.hidden && this.lineGraph) {
            this.lineGraph.resizeNode();
        }
    }

    debug(txt) {
        this.parent.debug(txt);
    }

    keyAction(key) {
        if (['w', 's'].includes(key.full)) {
            const zoom = key.name === 'w' ? -1 : 1;
            this.emit('zoomGraphs', zoom);
        } else if (['a', 'd'].includes(key.name)) {
            let scroll;
            if (key.full === 'a') {
                scroll = -1;
            } else if (key.full === 'd') {
                scroll = 1;
            } else if (key.full === 'S-a') {
                scroll = -10;
            } else if (key.full === 'S-d') {
                scroll = 10;
            }

            if (scroll > 0 && !this.metricsProvider.isScrolled()) {
                return;
            }

            this.metricsProvider.adjustScrollOffset(scroll);
        } else if (['z', 'x'].includes(key.full)) {
            const goto = key.name === 'z' ? -1 : 1;
            this.emit('startGraphs', goto);
        }
    }

    onDrag() {
        if (!this.mouseData || this.dragInterval === null) {
            return;
        }

        if (this.mouseData.dragging && this.mouseData.diffX !== 0) {
            let mod = this.mouseData.diffX < 0 ? -1 : 1;
            let scroll = Math.abs(this.mouseData.diffX);
            if (scroll <= 3) {
                scroll = 1;
            } else if (scroll <= 6) {
                scroll = 2;
            } else if (scroll <= 9) {
                scroll = 3;
            } else if (scroll <= 12) {
                scroll = 4;
            } else {
                scroll = 5;
            }

            this.metricsProvider.adjustScrollOffset(scroll * mod);
        }
    }

    doMouseEvent() {
        return this.parent && this.parent.focused;
    }

    initStatsEvents() {
        this.on('wheelup', () => {
            if (this.doMouseEvent()) {
                this.emit('zoomGraphs', -1);
            }
        });

        this.on('wheeldown', () => {
            if (this.doMouseEvent()) {
                this.emit('zoomGraphs', 1);
            }
        });

        this.on('mousedown', () => {
            if (!this.mouseDown && this.doMouseEvent()) {
                this.dragInterval = setInterval(this.onDrag, 50);
                this.mouseDown = true;
            }
        });

        this.on('mouseup', () => {
            if (this.mouseDown && this.doMouseEvent()) {
                this.mouseDown = false;
                clearInterval(this.dragInterval);
                this.dragInterval = null;
                this.mouseData = null;
            }
        });

        this.on('mousemove', data => {
            if (data.dragging && this.doMouseEvent()) {
                this.mouseData = data;
            }
        });

        this.on('connection data', parsed => {
            if (parsed && this.parent) {
                this.emit('metrics', parsed);
            }
        });

        this.on('connection error', () => {
            if (this.lineGraph) {
                this.lineGraph.destroy();
                this.lineGraph = null;
            }
        });

        this.on('focus', () => {
            if (this.parent) {
                this.parent.focus();
            }
        });

        this.on(
            'keypress',
            debounce(
                function (ch, key) {
                    if (['w', 's', 'a', 'd', 'z', 'x'].includes(key.name)) {
                        this.keyAction(key);
                    } else if (key.full === 'C-z') {
                        this.screen.removeListener(
                            'terminal state',
                            this.onTerminalState
                        );
                        this.screen.removeListener(
                            'resize',
                            this.debouncedResize
                        );
                        this.freeze = true;
                        if (this.lineGraph) {
                            this.lineGraph.destroy();
                            this.lineGraph = null;
                        }
                        this.destroy();
                    }
                }.bind(this),
                15,
                { leading: true, trailing: true }
            )
        );

        this.screen.on('resize', this.debouncedResize);
        this.screen.on('terminal state', this.onTerminalState);

        this.on('destroy', () => {
            this.screen.removeListener('terminal state', this.onTerminalState);
            this.screen.removeListener('resize', this.debouncedResize);
            this.freeze = true;
            if (this.lineGraph) {
                this.lineGraph.destroy();
                this.lineGraph = null;
            }
            this.cleanConnection();
        });
    }

    onTerminalState(state, change) {
        if (this.watchTerm && state.id === this.watchTerm) {
            if (change === 'restarted' && !this.restarting) {
                this.restarting = true;
                this.errored = false;
                setTimeout(() => {
                    this.activate();
                    this.restarting = false;
                }, 1000);
            }
        }
    }
}

module.exports = aggregation(Stats, NetClient);
