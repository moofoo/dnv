// adapted from https://github.com/laggingreflex/findep

const fs = require('fs-promise');
const { join } = require('path');

let cwd = process.cwd();

exports.setCwd = (newCwd) => {
    cwd = newCwd || cwd;
};

exports.fromCwd = (...path) => join(cwd, ...path);

const fileCache = {};

exports.readJsonFromFile = (file) => {
    fileCache[file] = fileCache[file] || fs.readJSON(file);
    return fileCache[file];
};
