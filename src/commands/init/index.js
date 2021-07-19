const initAction = require('./action');

const init = async () => {
    if (process.argv.length > 3) {
        await require('./program')(initAction);
    } else {
        await initAction();
    }
};

module.exports = init;
