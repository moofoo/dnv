const stopAction = require('./action');

const stop = async () => {
    if (process.argv.length > 3) {
        await require('./program')(stopAction);
    } else {
        await stopAction();
    }
};

module.exports = stop;
