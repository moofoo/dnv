const aggregation = require('aggregation/es6');

const PanelBase = require('./base');
const PanelItemActions = require('./method-mixins/item-actions');
const PanelHelp = require('./method-mixins/help');
const PanelLabels = require('./method-mixins/labels');
const PanelFocus = require('./method-mixins/panel-focus');
const PanelGrid = require('./method-mixins/panel-grid');

module.exports = aggregation(
    PanelBase,
    PanelItemActions,
    PanelHelp,
    PanelLabels,
    PanelFocus,
    PanelGrid
);
