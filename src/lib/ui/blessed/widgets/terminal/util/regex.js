const isRegex = (string) => {
    if (/.*\/gi$/.test(string)) {
        string = string.replace('/gi', '/');
    } else if (/.*\/g$/.test(string)) {
        string = string.replace('/g', '/');
    }

    if (string.charAt(0) === '/' && string.charAt(string.length - 1) === '/') {
        return true;
    }

    return false;
};

const prepRegex = (string) => {
    if (/.*\/gi$/.test(string)) {
        string = string.replace('/gi', '/');
    } else if (/.*\/g$/.test(string)) {
        string = string.replace('/g', '/');
    }

    return string.substr(1, string.length - 2);
};

const isValidRegex = (string) => {
    let isValid = true;
    try {
        new RegExp(string);
    } catch (e) {
        isValid = false;
    }

    return isValid;
};

module.exports = {
    isRegex,
    prepRegex,
    isValidRegex,
};
