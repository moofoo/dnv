const Docker = require('dockerode');

const getDocker = (() => {
    let docker;

    return (opts) => {
        if (opts) {
            return new Docker(opts);
        }

        docker = docker || new Docker();
        return docker;
    };
})();

module.exports = {
    getDocker,
};
