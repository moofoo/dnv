const blessed = require('blessed'),
    Node = blessed.Node,
    Canvas = require('./canvas'),
    { arrayMax } = require('./utils'),
    InnerCanvas = require('./drawille-canvas').Canvas;

function Line(options) {
    if (!(this instanceof Node)) {
        return new Line(options);
    }

    options.unit = options.unit || '%';
    options.showNthLabel = options.showNthLabel || 1;
    options.style = options.style || {};
    options.xLabelPadding =
        options.xLabelPadding !== undefined ? options.xLabelPadding : 5;
    options.xPadding = options.xPadding !== undefined ? options.xPadding : 10;
    options.numYLabels = options.numYLabels || 5;
    options.legend = options.legend || {};
    options.wholeNumbersOnly = options.wholeNumbersOnly || false;
    options.minY = options.minY || 0;
    options.yLabelPadding =
        options.yLabelPadding !== undefined ? options.yLabelPadding : 6;
    options.yPadding = options.yPadding !== undefined ? options.yPadding : 8;
    options.showXAxis =
        options.showXAxis !== undefined ? options.showXAxis : true;
    options.customLegends = options.customLegends || false;

    options.widthOffset =
        options.widthOffset !== undefined ? options.widthOffset : 16;
    options.heightOffset =
        options.heightOffset !== undefined ? options.heightOffset : 0; // options.showXAxis ? 8 : 4;

    options.legendBorder = options.legendBorder || {
        type: 'line',
        fg: 'black',
    };

    options.legendStyle = options.legendStyle || {
        fg: 'blue',
    };

    this.init = true;

    Canvas.call(this, options);
}

Line.prototype.calcSize = function () {
    //   if (!this.detached) {
    //this.canvasSize = { width: this.width * 2, height: this.height * 4 };
    this.canvasSize = {
        width: this.width * 2 - 2,
        height: this.height * 4,
    };
    //  }
};

Line.prototype.__proto__ = Canvas.prototype;

Line.prototype.type = 'line';

Line.prototype.resize = function (data) {
    if (this.parent) {
        this.calcSize();
        this._canvas = new InnerCanvas(
            this.canvasSize.width,
            this.canvasSize.height
        );
        this.ctx = this._canvas.getContext();
    }
};

Line.prototype.addLegend = function (data, legends) {
    if (!this.parent) {
        return;
    }

    data = data || this._data;

    if (!data || !legends) {
        return;
    }

    if (!this.options.showLegend) return;

    if (this.legend) this.remove(this.legend);

    let legendWidth;

    if (this.options.legend) {
        legendWidth = this.options.legend.width || 15;
    } else if (legends) {
        let len = 0;
        Object.values(legends).forEach((legend) => {
            if (legend.title.length > len) {
                len = legend.title.length;
            }
        });

        legendWidth = len;
    }

    this.legend = blessed.box({
        height: legends
            ? Object.keys(legends || {}).length + 2
            : data.length + 2,
        top: 0,
        shrink: true,
        left: this.width - legendWidth - 2,
        content: '',
        tags: true,
        border: this.options.legendBorder,
        screen: this.screen,
    });

    if (legends) {
        let legendText = '';

        Object.values(legends).forEach((legend) => {
            let { title, color } = legend;

            if (color.includes('bright')) {
                color = `bright-${color.replace('bright', '')}`;
            }
            legendText +=
                '{' + color + '-fg}' + title + '{/' + color + '-fg}\r\n';
        });

        if (typeof legendText === 'string' && !legendText.includes('Object')) {
            this.legend.setContent(legendText);
        }
    } else if (this.options.legend && typeof this.options.legend === 'string') {
        this.legend.setContent(this.options.legend);
    } else {
        var legendText = '';
        var maxChars = legendWidth;
        for (var i = 0; i < data.length; i++) {
            var style = data[i].style || {};
            var color = style.line || this.options.style.line;
            if (color.includes('bright')) {
                color = `bright-${color.replace('bright', '')}`;
            }
            legendText +=
                '{' +
                color +
                '-fg}' +
                data[i].title.substring(0, maxChars) +
                '{/' +
                color +
                '-fg}\r\n';
        }
        this.legend.setContent(legendText);
    }

    this.append(this.legend);
};

Line.prototype.setData = function (data) {
    if (!this.ctx) {
        throw 'error: canvas context does not exist. setData() for line charts must be called after the chart has been added to the screen via screen.append()';
    }

    // compatability with older API
    if (!Array.isArray(data)) data = [data];

    this._data = data;

    var self = this;
    var xLabelPadding = this.options.xLabelPadding;
    var yLabelPadding = this.options.yLabelPadding;
    var xPadding = this.options.xPadding;
    var yPadding = this.options.yPadding;
    var c = this.ctx;
    var labels = data[0].x;

    this._labels = labels;

    function getMax(v, i) {
        return parseFloat(v);
    }

    //for some reason this loop does not properly get the maxY if there are multiple datasets (was doing 4 datasets that differred wildly)
    function getMaxY() {
        if (self.options.unit === '%' && self.options.maxY) {
            return self.options.maxY;
        }

        var max = 0;
        var setMax = [];

        for (var i = 0; i < data.length; i++) {
            if (data[i].y.length) {
                setMax[i] = arrayMax(data[i].y, getMax);
            }

            for (var j = 0; j < data[i].y.length; j++) {
                if (data[i].y[j] > max) {
                    max = data[i].y[j];
                }
            }
        }

        var m = arrayMax(setMax, getMax);
        max = m * 1.2;
        max *= 1.2;
        if (self.options.maxY) {
            return Math.max(max, self.options.maxY);
        }
        if (max === self.options.minY) {
            return 10;
        }
        return max;
    }

    function formatYLabel(
        value,
        max,
        min,
        numLabels,
        wholeNumbersOnly,
        abbreviate
    ) {
        var fixed =
            max / numLabels < 1 && value != 0 && !wholeNumbersOnly ? 2 : 0;
        var res = value.toFixed(fixed);
        if (typeof abbreviate === 'function') {
            return abbreviate(res);
        } else {
            return res;
        }
    }

    var yLabelIncrement =
        ((this.options.unit === '%' ? 100 : getMaxY()) - this.options.minY) /
        this.options.numYLabels;
    if (this.options.wholeNumbersOnly)
        yLabelIncrement = Math.floor(yLabelIncrement);

    yLabelIncrement = Math.max(yLabelIncrement, 1); // should not be zero

    function getMaxXLabelPadding(numLabels, wholeNumbersOnly, abbreviate, min) {
        var maxY = getMaxY();
        var maxLabel = 0;
        for (var i = min; i < maxY; i += yLabelIncrement) {
            maxLabel = Math.max(
                maxLabel,
                formatYLabel(
                    i,
                    maxY,
                    min,
                    numLabels,
                    wholeNumbersOnly,
                    abbreviate
                ).length
            );
        }
        return 2 * (maxLabel + 1);
    }

    var maxPadding = getMaxXLabelPadding(
        this.options.numYLabels,
        this.options.wholeNumbersOnly,
        this.options.abbreviate,
        this.options.minY
    );
    if (xLabelPadding < maxPadding) {
        xLabelPadding = maxPadding;
    }

    if (xPadding - xLabelPadding < 0) {
        xPadding = xLabelPadding;
    }

    function getMaxX() {
        var maxLength = 0;

        for (var i = 0; i < labels.length; i++) {
            if (labels[i] === undefined) {
                console.log('label[' + i + '] is undefined');
            } else if (labels[i].length > maxLength) {
                maxLength = labels[i].length;
            }
        }

        return maxLength;
    }

    function getXPixel(val) {
        return (
            ((self.canvasSize.width - xPadding) / labels.length) * val +
            xPadding * 1.0 +
            2
        );
    }

    function getYPixel(val, minY, offset = 2, maxY) {
        var res =
            self.canvasSize.height -
            yPadding -
            ((self.canvasSize.height - yPadding) /
                ((maxY || getMaxY()) - minY)) *
                (val - minY);
        res -= offset; //to separate the baseline and the data line to separate chars so canvas will show separate colors
        return res;
    }

    // Draw the line graph
    function drawLine(values, style, minY) {
        style = style || {};
        var color = self.options.style.line;
        c.strokeStyle = style.line || color;

        c.moveTo(0, 0);
        c.beginPath();
        c.lineTo(getXPixel(0), getYPixel(values[0], minY));

        for (var k = 1; k < values.length; k++) {
            let v = values[k];
            if (self.options.unit === '%' && v >= 99) {
                v = 95;
            }

            c.lineTo(
                getXPixel(k),
                //getYPixel(self.options.unit === '%' && values[k] >= 99 ? 95 : values[k], minY)
                getYPixel(v, minY)
            );
        }

        c.stroke();
    }

    if (!this.options.customLegends) {
        this.addLegend(data);
    }

    c.fillStyle = this.options.style.text;
    c.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);

    // Draw the Y value texts
    var maxY = getMaxY();
    let l = 0;
    let len = this.options.unit === '%' ? 100 : maxY;
    for (var i = this.options.minY; i < len; i += yLabelIncrement) {
        l++;
        c.fillText(
            formatYLabel(
                i,
                100,
                this.options.minY,
                this.options.numYLabels,
                this.options.wholeNumbersOnly,
                this.options.abbreviate
            ),

            xPadding - xLabelPadding,
            //  getYPixel(i, this.options.minY, 1, this.options.unit === '%' ? 100 : null)
            getYPixel(i, this.options.minY)
        );
    }

    for (var h = 0; h < data.length; h++) {
        const yVal = data[h].y;
        drawLine(yVal, data[h].style, this.options.minY);
    }

    c.strokeStyle = this.options.style.baseline;

    // Draw the axises
    c.beginPath();

    c.lineTo(xPadding, 0);
    c.lineTo(xPadding, this.canvasSize.height - yPadding);
    c.lineTo(this.canvasSize.width, this.canvasSize.height - yPadding);

    c.stroke();

    // Draw the X value texts
    var charsAvailable = (this.canvasSize.width - xPadding) / 2;
    var maxLabelsPossible = charsAvailable / (getMaxX() + 2);
    var pointsPerMaxLabel = Math.ceil(data[0].y.length / maxLabelsPossible);
    var showNthLabel = this.options.showNthLabel;
    if (showNthLabel < pointsPerMaxLabel) {
        showNthLabel = pointsPerMaxLabel;
    }

    if (this.options.showXAxis) {
        for (var i = 0; i < labels.length; i += showNthLabel) {
            if (
                getXPixel(i) + labels[i].length * 2 <
                this.canvasSize.width + 1
            ) {
                c.fillText(
                    labels[i],
                    getXPixel(i),
                    this.canvasSize.height - yPadding + yLabelPadding
                );
            }
        }
    }
};

module.exports = Line;
