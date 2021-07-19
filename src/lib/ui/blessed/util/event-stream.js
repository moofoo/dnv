const { getDocker } = require('../../../docker/util');

const containerEventStream = (containers, cb) => {
    return new Promise((resolve, reject) => {
        const docker = getDocker();

        docker.getEvents(
            {
                filters: {
                    container: containers,
                    event: ['start', 'restart', 'stop', 'kill', 'die'],
                },
            },
            (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                stream.on('data', cb);

                resolve(stream);
            }
        );
    });
};

module.exports = containerEventStream;
