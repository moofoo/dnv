const Line = require('./contrib/line');
const util = require('util');
const times = require('lodash.times');
const constant = require('lodash.constant');
const mapValues = require('lodash.mapvalues');
const forEach = require('lodash.foreach');
const map = require('lodash.map');

const chalk = require('chalk');

let renderTimeout = null;
let renderTail = null;

class Graph {
    constructor(options) {
        options = {
            limit: 30,
            ...options,
        };

        this.options = { ...options };

        this.lastMetrics = {};

        this.parent = this.options.parent;
        this.screen = this.options.screen;

        this.metricsProvider = this.options.metricsProvider;

        this.unit = this.options.unit || '';
        this.label = this.options.title
            ? util.format(' %s ', this.options.title)
            : ' ';

        this._remountOnResize = true;

        //        this._getPosition = (el) => el.position;

        this.resizeNode = this.resizeNode.bind(this);

        this.limit = this.options.limit;
        this.seriesOptions = this.options.series;

        this.init = true;

        const xAxis = this.metricsProvider.getXAxis(this.options.limit);

        this.series = mapValues(this.options.series, (seriesConfig) => {
            if (seriesConfig.highwater && !seriesConfig.color) {
                seriesConfig.color = 'red';
            }
            return {
                x: xAxis,
                y: times(this.limit, constant(0)),
                style: {
                    line: seriesConfig.color,
                },
            };
        });

        this.initGraphEvents();

        this._createGraph(options);
    }

    resizeNode() {
        if (!this.node.detached) {
            this.node.resize();
            this.node.setData(Object.values(this.series));
            this.parent.fullRender();
        }
    }

    initGraphEvents() {
        this._boundOnEvent = this.options.onEvent.bind(this);
        this._boundOnRefreshMetrics = this.options.onRefreshMetrics.bind(this);

        this.metricsProvider.on('metrics', this._boundOnEvent);
        this.metricsProvider.on('refreshMetrics', this._boundOnRefreshMetrics);
    }

    _isHighwater(name) {
        return this.seriesOptions[name].highwater;
    }

    update(values) {
        forEach(values, (value, seriesName) => {
            if (!this.series[seriesName]) {
                return;
            }
            if (this._isHighwater(seriesName)) {
                this.series[seriesName].y = times(this.limit, constant(value));
            } else {
                this.series[seriesName].y.shift();
                this.series[seriesName].y.push(value);
            }
        });

        this.node.setData(
            Object.values(this.series),
            this.metricsProvider.isScrolled
        );

        if (this.options.showLegend) {
            this._updateLegends();
        } else {
            this._updateLabel();
        }

        this.parent.fullRender();

        //fullRender(this.screen);
    }

    refresh(mapper) {
        const data = mapper(this.metricsProvider.getMetrics(this.limit));
        const xAxis = this.metricsProvider.getXAxis(this.options.limit);

        forEach(data[0], (value, seriesName) => {
            if (!this.series[seriesName]) {
                return;
            }
            if (this._isHighwater(seriesName)) {
                this.series[seriesName].y = times(this.limit, constant(value));
            } else {
                this.series[seriesName].y = times(this.limit, constant(0));
            }
            this.series[seriesName].x = xAxis;
        });

        forEach(data, (values) => {
            forEach(values, (value, seriesName) => {
                if (!this.series[seriesName]) {
                    return;
                }
                if (!this._isHighwater(seriesName)) {
                    this.series[seriesName].y.shift();
                    this.series[seriesName].y.push(value);
                }
            });
        });

        this.node.setData(
            Object.values(this.series),
            this.metricsProvider.isScrolled
        );

        if (this.options.showLegend) {
            this._updateLegends();
        } else {
            this._updateLabel();
        }

        this.parent.fullRender();
    }

    _updateLegends() {
        const seriesLegends = Object.keys(this.series)
            .reverse()
            .map((id) => {
                let seriesLabel = '';
                if (this.seriesOptions[id].label) {
                    seriesLabel = `${this.seriesOptions[id].label} `;
                } else if (!this.seriesOptions[id].hasOwnProperty('label')) {
                    seriesLabel = `${id} `;
                }
                return {
                    ...this.seriesOptions[id],
                    title: util.format(
                        '%s(%d%s)',
                        seriesLabel,
                        this.series[id].y[this.series[id].y.length - 1],
                        this.unit
                    ),
                };
            });

        if (!this.init && Object.values(this.series).length) {
            this.node.addLegend(Object.values(this.series), seriesLegends);
        }
    }

    _updateLabel() {
        const seriesLabels = map(this.series, (series, id) => {
            let seriesLabel = '';
            if (this.seriesOptions[id].label) {
                seriesLabel = `${this.seriesOptions[id].label} `;
            } else if (!this.seriesOptions[id].hasOwnProperty('label')) {
                seriesLabel = `${id} `;
            }
            return chalk[this.seriesOptions[id].color](
                util.format(
                    '%s(%d%s)',
                    seriesLabel,
                    Number(
                        this.series[id].y[this.series[id].y.length - 1]
                    ).toFixed(2),
                    this.unit
                )
            );
        }).join(' ');

        this.node.setLabel(util.format('%s%s ', this.label, seriesLabels));
        this.node._label.aleft +=
            this.options.labelOffset !== undefined
                ? this.options.labelOffset
                : 2;
        this.node._label.wrap = false;
        this.node._label.width = this.node._label.getText().length;
        if (this.options.align) {
            this.node._label.align = this.options.align;
        }
    }

    _createGraph(options) {
        this.node = new Line({
            debug: this.parent.debug.bind(this.parent),
            parent: this.parent,
            screen: this.screen,
            labelOffset: this.options.labelOffset,
            top: 0,
            label: '',
            height: '100%',
            width: '100%',
            border: this.options.borderColor && {
                type: 'line',
                fg: this.options.borderColor,
            },
            numYLabels: options.numYLabels,
            maxY: options.maxY,
            showXAxis: this.options.showXAxis,
            yPadding: this.options.yPadding,
            showLegend: this.options.showLegend,
            wholeNumbersOnly: false,
            heightOffset: this.options.heightOffset,
            yLabelPadding: this.options.yLabelPadding,
            unit: this.options.unit,
        });

        this.parent.append(this.node);

        const values = this.metricsProvider.getMetrics(this.limit);

        forEach(values, (value) => {
            this._boundOnEvent(value);
        });

        setTimeout(() => {
            this.init = false;
            this.screen.emit('resize');
        }, 250);

        this.parent.fullRender();
    }

    destroy() {
        this.metricsProvider.removeListener('metrics', this._boundOnEvent);
        this.metricsProvider.removeListener(
            'refreshMetrics',
            this._boundOnRefreshMetrics
        );

        this._boundOnEvent = null;
        this._boundOnRefreshMetrics = null;
        this.metricsProvider = null;

        //        process.nextTick(() => {
        this.node.destroy();
        //      });
    }
}

module.exports = Graph;
