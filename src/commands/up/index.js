const { upAction } = require('./action');

const up = async () => {
    if (process.argv.length > 3) {
        await require('./program')(upAction);
    } else {
        await upAction();
    }
};

module.exports = up;
