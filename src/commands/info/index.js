const infoAction = require('./action');

const info = async () => {
    if (process.argv.length > 3) {
        await require('./program')(infoAction);
    } else {
        await infoAction();
    }
};

module.exports = info;
