const cmdExistsSync = require('command-exists').sync;

const hasDocker = () => {
    const dockerExists = cmdExistsSync('docker');
    const dockerComposeExists = cmdExistsSync('docker-compose');

    return dockerExists && dockerComposeExists;
};

module.exports = hasDocker;
