//From https://github.com/croquiscom/rinore

const fs = require('fs');
const os = require('os');

function setupHistory(replServer, historyFile, historySize) {
    if (!fs.existsSync(historyFile)) {
        fs.writeFileSync(historyFile, '');
    }

    try {
        const data = fs.readFileSync(historyFile, 'utf8');
        if (data) {
            const histories = data.split(/[\n\r]+/);
            if (histories[histories.length - 1] === '') {
                histories.pop();
            }
            if (histories.length > historySize) {
                histories.splice(0, histories.length - historySize);
                fs.writeFileSync(historyFile, histories.join(os.EOL) + os.EOL, 'utf8');
            }
            histories.reverse();
            replServer.history = histories;
        }
    } catch (error) {
        // can not read historyFile, just skip
    }

    const fd = fs.openSync(historyFile, 'a');
    replServer.on('line', (line) => {
        fs.writeSync(fd, line + os.EOL, null, 'utf8');
    });
    replServer.on('exit', () => {
        fs.closeSync(fd);
    });
}

module.exports = setupHistory;
