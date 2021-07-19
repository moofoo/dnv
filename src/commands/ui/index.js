const uiAction = require('./action');

const ui = async () => {
    if (process.argv.length > 3) {
        await require('./program')(uiAction);
    } else {
        await uiAction();
    }
};

module.exports = ui;
