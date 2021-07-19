'use strict';
var blessed = require('blessed'),
    Node = blessed.Node,
    Box = blessed.Box;

function Tree(options) {
    if (!(this instanceof Node)) {
        return new Tree(options);
    }

    var self = this;
    options = options || {};
    options.bold = true;
    this.options = options;
    this.data = {};
    this.nodeLines = [];
    this.lineNbr = 0;
    Box.call(this, options);

    options.extended = options.extended || false;
    options.keys = ['space', 'return'];

    options.template = options.template || {};
    options.template.extend = options.template.extend || ' [+]';
    options.template.retract = options.template.retract || ' [-]';
    options.template.lines = options.template.lines || false;

    // Do not set height, since this create a bug where the first line is not always displayed
    this.rows = new blessed.List({
        parent: this,
        top: 0,
        width: 0,
        left: 1,
        padding: options.padding,
        tags: options.tags,
        vi: options.vi,
        ignoreKeys: options.ignoreKeys,
        selectedBg: 'blue',
        mouse: true,
        keys: options.keys,
        interactive: true,
        insideWheel: false,
        outsideClick: true,
        focused: true,
        scrollable: true,
        shadow: true,
        scrollbar: {
            ch: ' ',
            style: { bg: 'white' },
        },
        border: {
            type: 'line',
            fg: 'cyan',
            bg: 'black',
        },
        style: {
            label: {
                fg: '#fdff92',
            },
            bg: 'black',
            item: {
                fg: 'brightwhite',
                bold: true,
            },
            selected: {
                bold: true,
                fg: 'cyan',
            },
        },
    });

    this.rows.on('destroy', () => {
        this.screen.grabMouse = false;
    });

    this.rows.grabMouse = true;
    this.screen.grabMouse = true;

    //  this.append(this.rows);

    this.rows.unkey('select');
    this.rows.unkey('return');

    process.nextTick(() => {
        let onkey = false;

        this.rows.key(options.keys, function () {
            if (onkey) {
                return;
            }

            onkey = true;
            const index = this.getItemIndex(this.selected);

            var selectedNode = self.nodeLines[index];

            if (selectedNode.directory && selectedNode.children) {
                selectedNode.extended = !selectedNode.extended;
                self.setData(self.data);

                this.scroll(this.childOffset - 1);
                self.screen.render();
            }

            if (!selectedNode.directory) {
                self.emit('select', selectedNode, index);
            }

            process.nextTick(() => {
                onkey = false;
            });
        });
    });
}

Tree.prototype = Object.create(Box.prototype);

Tree.prototype.walk = function (node, treeDepth) {
    var lines = [];

    if (!node.parent) {
        // root level
        this.lineNbr = 0;
        this.nodeLines.length = 0;
        node.parent = null;
    }

    if (treeDepth === '' && node.name) {
        this.lineNbr = 0;
        this.nodeLines[this.lineNbr++] = node;
        lines.push(node.name);
        treeDepth = ' ';
    }

    node.depth = treeDepth.length - 1;

    if (node.children && node.extended) {
        var i = 0;

        if (typeof node.children === 'function')
            node.childrenContent = node.children(node);

        if (!node.childrenContent) node.childrenContent = node.children;

        for (var child in node.childrenContent) {
            if (!node.childrenContent[child].name)
                node.childrenContent[child].name = child;

            child = node.childrenContent[child];
            child.parent = node;
            child.position = i++;

            if (typeof child.extended === 'undefined')
                child.extended = this.options.extended;

            if (typeof child.children === 'function')
                child.childrenContent = child.children(child);
            else child.childrenContent = child.children;

            var isLastChild =
                child.position ===
                Object.keys(child.parent.childrenContent).length - 1;
            var treePrefix;
            var suffix = '';
            if (isLastChild) treePrefix = '└';
            else treePrefix = '├';

            if (
                !child.childrenContent ||
                Object.keys(child.childrenContent).length === 0
            ) {
                treePrefix += '─';
            } else if (child.extended) {
                treePrefix += '┬';
                suffix = this.options.template.retract;
            } else {
                treePrefix += '─';
                suffix = this.options.template.extend;
            }

            if (!this.options.template.lines) treePrefix = '|-';
            if (this.options.template.spaces) treePrefix = ' ';

            lines.push(treeDepth + treePrefix + child.name + suffix);

            this.nodeLines[this.lineNbr++] = child;

            var parentTree;
            if (isLastChild || !this.options.template.lines)
                parentTree = treeDepth + ' ';
            else parentTree = treeDepth + '│';

            lines = lines.concat(this.walk(child, parentTree));
        }
    }
    return lines;
};

Tree.prototype.focus = function () {
    if (!this.rows) {
        return;
    }

    this.rows.focus();
};

Tree.prototype.render = function () {
    if (!this.rows) {
        return;
    }

    if (this.screen.focused === this.rows) this.rows.focus();

    this.rows.width = this.width - 3;
    this.rows.height = this.height - 3;
    Box.prototype.render.call(this);
};

Tree.prototype.setData = function (nodes) {
    this.data = nodes;
    this.rows.setItems(this.walk(nodes, ''));
};

Tree.prototype.type = 'tree';

module.exports = Tree;
