const configAction = require('./action');

const configs = async () => {
    if (process.argv.length > 3) {
        await require('./program')(configAction);
    } else {
        await configAction();
    }
};

module.exports = configs;
