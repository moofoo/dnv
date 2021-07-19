const blessed = require('blessed');

require('./node');
require('./color');
require('./program');
require('./screen');
require('./element');
require('./position');
require('./listbar');
require('./textarea');
require('./list');
require('./term-state');

blessed.Box.prototype.render = blessed.Element.prototype.render;
blessed.Box.prototype._render = blessed.Element.prototype.render;
blessed.Listbar.prototype.__proto__ = blessed.Element.prototype;
blessed.Listbar.prototype._render = blessed.Element.prototype.render;
