const clearAction = require('./action');

const clear = async () => {
    await require('./program')(clearAction);
};

module.exports = clear;
