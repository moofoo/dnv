const net = require('net');
const os = require('os');

const port = process.env.STATS_PORT || 9838;
const host = '0.0.0.0';

function hrtime2ms(time) {
    return time[0] * 1e3 + time[1] * 1e-6;
}

const MB = Math.pow(1024, 2);

class ProcessStat {
    constructor(sampleInterval) {
        if (typeof sampleInterval !== 'number') {
            throw new TypeError('sample interval must be a number');
        }

        this.sampleInterval = sampleInterval;

        this._lastDelay = null;
        this._lastHandles = null;
        this._lastUsed = null;
        this._lastTotal = null;
        this._lastRss = null;

        this.high = 0;
        this.refresh();
    }

    _getMemory() {
        const memUsage = process.memoryUsage();
        let heapUsed;
        let heapTotal;
        let rss;

        if (!memUsage) {
            if (this._lastUsed) {
                heapUsed = this._lastUsed;
                heapTotal = this._lastTotal;
                rss = this._lastRss;
            } else {
                heapUsed = 0;
                heapTotal = 0;
                rss = 0;
            }
        } else {
            if (
                (isNaN(memUsage.heapUsed) || memUsage.heapUsed <= 0) &&
                this._lastUsed !== null
            ) {
                heapUsed = this._lastUsed;
            } else {
                heapUsed = memUsage.heapUsed;
            }

            if (
                (isNaN(memUsage.heapTotal) || memUsage.heapTotal <= 0) &&
                this._lastTotal !== null
            ) {
                heapTotal = this._lastTotal;
            } else {
                heapTotal = memUsage.heapTotal;
            }

            if (
                (isNaN(memUsage.rss) || memUsage.rss <= 0) &&
                this._lastRss !== null
            ) {
                rss = this._lastRss;
            } else {
                rss = memUsage.rss;
            }
        }

        if (heapTotal > 0) {
            this._lastTotal = heapTotal;
        }

        if (heapUsed > 0) {
            this._lastUsed = heapUsed;
        }

        if (rss > 0) {
            this._lastRss = rss;
        }

        return {
            heapTotal,
            heapUsed,
            rss,
        };
    }

    _getHandles() {
        let activeHandles = process._getActiveHandles();

        if (
            (!activeHandles || activeHandles.length === 0) &&
            this._lastHandles !== null
        ) {
            activeHandles = this._lastHandles;
        } else {
            activeHandles = activeHandles.length;
        }

        if (activeHandles > 0) {
            this._lastHandles = activeHandles;
        }

        return activeHandles;
    }

    _sampleDelay(elapsedTime) {
        let sample = elapsedTime - this.sampleInterval;

        if ((isNaN(sample) || sample < 0) && this._lastDelay !== null) {
            sample = this._lastDelay;
        }

        sample = Math.max(0, sample);

        if (sample > 0) {
            this._lastDelay = sample;
        }

        return sample;
    }

    _sampleCpuUsage(elapsedTime) {
        const elapsedCpuUsage = process.cpuUsage(this._lastSampleCpuUsage);
        const elapsedCpuUsageTotal =
            (elapsedCpuUsage.user + elapsedCpuUsage.system) / 1000;

        return elapsedCpuUsageTotal / elapsedTime;
    }

    refresh() {
        this._lastSampleTime = process.hrtime();
        this._lastSampleCpuUsage = process.cpuUsage();
    }

    sample() {
        const elapsedTime = hrtime2ms(process.hrtime(this._lastSampleTime));
        const memUsage = this._getMemory();

        const delay = this._sampleDelay(elapsedTime);
        this.high = Math.max(this.high, delay);

        return {
            metrics: {
                heapUsed: memUsage.heapUsed / MB,
                heapTotal: memUsage.heapTotal / MB,
                rss: memUsage.rss / MB,
                High: this.high,
                Delay: delay,
                CPU: Number(this._sampleCpuUsage(elapsedTime) * 100).toFixed(3),
                handles: this._getHandles(),
            },
        };
    }
}
if (process.env.STATS_PORT) {
    const clients = [];

    const server = net.createServer();

    server.on('connection', function (socket) {
        totalMem = os.totalmem();
        lastDate = Date.now();
        lastUsage = process.cpuUsage();

        clients.push(socket);

        const processStat = new ProcessStat(1000);

        let timer = null;
        function scheduleSample() {
            timer = setTimeout(saveSample, processStat.sampleInterval);
            timer.unref();
        }

        const saveSample = () => {
            let sample;

            if (!socket.destroyed && socket.writable) {
                sample = processStat.sample();
                socket.write(JSON.stringify(sample));
                processStat.refresh();
                scheduleSample();
            }
        };

        setTimeout(() => {
            processStat.refresh();
            scheduleSample();
        });

        socket.on('close', function () {
            clearInterval(timer);
            clients.splice(clients.indexOf(socket), 1);
        });
    });

    server.listen({ port, host }, () => {
        //    console.log('metrics on', server.address());
    });
}
