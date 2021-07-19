const { PassThrough, pipeline } = require('stream');
const streamPipelinePromisified = require('util').promisify(pipeline);
const byLine = require('byline');

const sbStream = ({ scrollback = 1000 }) => {
    const stream = new PassThrough();
    stream.setEncoding('utf-8');

    let length = 0;
    const chunks = [];

    let chunky = '';

    stream.on('data', (chunk) => {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/.test(chunk)) {
            if (chunky.length) {
                chunks.push(chunky);
                chunky = '';
            }
        }

        chunky += chunky.length ? `\n${chunk}` : chunk;

        length = chunks.length;

        if (length > scrollback) {
            chunks.shift();
        }
    });
    if (chunky.length) {
        chunks.push(chunky);
    }

    stream.getBufferedValue = () => {
        return chunks;
    };

    stream.getBufferedLength = () => length;

    return stream;
};

async function scrollBackStream(inputStream, { scrollback = 1000 }) {
    const stream = sbStream({ scrollback });

    await new Promise((resolve) => {
        (async () => {
            try {
                await streamPipelinePromisified(
                    byLine.createStream(inputStream),
                    stream
                );
                resolve();
            } catch (error) {
                rejectPromise(error);
            }
        })();
    });

    return stream.getBufferedValue();
}

scrollBackStream.array = (stream, options) =>
    scrollBackStream(stream, { ...options, array: true });

module.exports = scrollBackStream;
