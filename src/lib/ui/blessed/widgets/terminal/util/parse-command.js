// Adapted from execa function (https://github.com/sindresorhus/execa/blob/main/lib/command.js)

const parseCommand = (command) => {
    let tokens = [];
    let match = command.match(/(["'])(?:(?=(\\?))\2.)*?\1/);
    let x = 1;

    while (match) {
        if (x > 10) {
            break;
        }
        const m = match[0];

        if (m.trim() === '') {
            break;
        }

        const m2 = m.replace(/ /g, '\\');
        command = command.replace(m, m2);
        match = command.match(/(["'])(?:(?=(\\?))\2.)*?\1/);
        x++;
    }

    for (const token of command.trim().split(/ +/g)) {
        const previousToken = tokens[tokens.length - 1];
        if (previousToken && previousToken.endsWith('\\')) {
            tokens[tokens.length - 1] = `${previousToken.slice(
                0,
                -1
            )} ${token}`;
        } else {
            tokens.push(token);
        }
    }

    tokens = tokens.map((token) => {
        return token.replace(/\\/g, ' ').replace(/[ ]{2}/g, ' ');
    });

    return [tokens[0], tokens.slice(1)];
};

module.exports = parseCommand;
