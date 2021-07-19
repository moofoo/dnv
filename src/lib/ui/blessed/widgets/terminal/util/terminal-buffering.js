const { StringDecoder } = require('string_decoder');

const bufferMap = new Map();
const callbackMap = new Map();

const flushBuffer = (id) => {
    const buffer = bufferMap.get(id);
    const cb = callbackMap.get(id) || function () {};

    if (buffer) {
        bufferMap.delete(id);
        if (cb) {
            cb(buffer.data.join(''));

            callbackMap.delete(id);
        }
    }
};

const stopBuffering = (id, flush = false) => {
    const buff = bufferMap.get(id);
    if (buff) {
        buff.dispose();
    }
};

const hasBuffered = (id) => {
    return !!bufferMap.get(id);
};

const getTermBufferer = (id, cb, decode = true, throttleBy = 5) => {
    stopBuffering(id);

    let decoder;

    if (decode) {
        decoder = new StringDecoder('utf8');
    }

    return (data) => {
        let buffer = bufferMap.get(id);

        if (buffer) {
            if (decode && decoder) {
                data = decoder.write(data);
            }
            buffer.data.push(data);
            return;
        }

        const timeoutId = setTimeout(() => flushBuffer(id), throttleBy);

        buffer = {
            data: [data],
            timeoutId: timeoutId,
            dispose: () => {
                clearTimeout(timeoutId);
                flushBuffer(id);
            },
        };
        bufferMap.set(id, buffer);
        callbackMap.set(id, cb);
    };
};

module.exports = {
    getTermBufferer,
    stopBuffering,
    hasBuffered,
};
