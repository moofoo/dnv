const blessed = require('blessed');

/*
    This implements a 'positionParent' option.

    You can use the positionParent option to specify an element to use for relative positioning, while
    having another element as the actual parent (in terms of the node tree), set by options.parent.

    In other words, this option lets you divorce 'positioning' from 'draw order',
    which are otherwise linked as a consequence of how Blessed recursively renders
    the node-tree of elements (with children positioned relative to parents).
    Which is actually very elegant, but sometimes you need to do things differently.

    This is useful for 'popups' or modals, which you may need to be children of 'screen' or
    an element higher in the node tree (for various reasons), but you also need them to be positioned
    relative to (within) some given element lower in the tree.

    'Various reasons' might include:
        - You need to mess with indexes (draw order) of elements which your popup/modal would otherwise be
          siblings of.
        - You're rendering elements out of node-tree order (for optimizations), which your
          popup needs to be displayed over.
        - You have a custom render method that doesn't recurse through
          the render methods of children as per usual, for whatever reason, but you need
          to have a popup positioned within to that element.
        - You need to refer to the (up to date) coordinates of the popup in the render
          method of another element, which you won't have if the popup is a
          sibling of that element and has a higher index.
*/

blessed.Element.prototype._getWidth = function (get) {
    var parent = get
            ? (this.options.positionParent || this.parent)._getPos()
            : this.options.positionParent || this.parent,
        width = this.position.width,
        left,
        expr;

    if (typeof width === 'string') {
        if (width === 'half') width = '50%';
        expr = width.split(/(?=\+|-)/);
        width = expr[0];
        width = +width.slice(0, -1) / 100;
        width = (parent.width * width) | 0;
        width += +(expr[1] || 0);
        return width;
    }

    // This is for if the element is being streched or shrunken.
    // Although the width for shrunken elements is calculated
    // in the render function, it may be calculated based on
    // the content width, and the content width is initially
    // decided by the width the element, so it needs to be
    // calculated here.
    if (width == null) {
        left = this.position.left || 0;
        if (typeof left === 'string') {
            if (left === 'center') left = '50%';
            expr = left.split(/(?=\+|-)/);
            left = expr[0];
            left = +left.slice(0, -1) / 100;
            left = (parent.width * left) | 0;
            left += +(expr[1] || 0);
        }
        width = parent.width - (this.position.right || 0) - left;
        if (this.screen.autoPadding) {
            if (
                (this.position.left != null || this.position.right == null) &&
                this.position.left !== 'center'
            ) {
                width -= (this.options.positionParent || this.parent).ileft;
            }
            width -= (this.options.positionParent || this.parent).iright;
        }
    }

    return width;
};

blessed.Element.prototype._getHeight = function (get) {
    var parent;
    var height;
    var top;
    var expr;
    try {
        (parent = get
            ? (this.options.positionParent || this.parent)._getPos()
            : this.options.positionParent || this.parent),
            (height = this.position.height),
            top,
            expr;
    } catch (err) {
        throw new Error(
            `${this.options.key || this.options.itemKey} ${this.type} ${
                err.message
            }`
        );
    }

    if (typeof height === 'string') {
        if (height === 'half') height = '50%';
        expr = height.split(/(?=\+|-)/);
        height = expr[0];
        height = +height.slice(0, -1) / 100;
        height = (parent.height * height) | 0;
        height += +(expr[1] || 0);
        return height;
    }

    // This is for if the element is being streched or shrunken.
    // Although the width for shrunken elements is calculated
    // in the render function, it may be calculated based on
    // the content width, and the content width is initially
    // decided by the width the element, so it needs to be
    // calculated here.
    if (height == null) {
        top = this.position.top || 0;
        if (typeof top === 'string') {
            if (top === 'center') top = '50%';
            expr = top.split(/(?=\+|-)/);
            top = expr[0];
            top = +top.slice(0, -1) / 100;
            top = (parent.height * top) | 0;
            top += +(expr[1] || 0);
        }
        height = parent.height - (this.position.bottom || 0) - top;
        if (this.screen.autoPadding) {
            if (
                (this.position.top != null || this.position.bottom == null) &&
                this.position.top !== 'center'
            ) {
                height -= (
                    this.options.positionParent ||
                    this.options.positionParent ||
                    this.parent
                ).itop;
            }
            height -= (this.options.positionParent || this.parent).ibottom;
        }
    }

    return height;
};

blessed.Element.prototype._getLeft = function (get) {
    var parent = get
            ? (this.options.positionParent || this.parent)._getPos()
            : this.options.positionParent || this.parent,
        left = (this.position && this.position.left) || 0,
        expr;

    if (typeof left === 'string') {
        if (left === 'center') left = '50%';
        expr = left.split(/(?=\+|-)/);
        left = expr[0];
        left = +left.slice(0, -1) / 100;
        left = (parent.width * left) | 0;
        left += +(expr[1] || 0);
        if (this.position.left === 'center') {
            left -= (this._getWidth(get) / 2) | 0;
        }
    }

    if (this.position.left == null && this.position.right != null) {
        return this.screen.cols - this._getWidth(get) - this._getRight(get);
    }

    if (this.screen.autoPadding) {
        if (
            (this.position.left != null || this.position.right == null) &&
            this.position.left !== 'center'
        ) {
            left += (this.options.positionParent || this.parent).ileft;
        }
    }

    return (parent.aleft || 0) + left;
};

blessed.Element.prototype._getRight = function (get) {
    var parent = get
            ? (this.options.positionParent || this.parent)._getPos()
            : this.options.positionParent || this.parent,
        right;

    if (this.position.right == null && this.position.left != null) {
        right = this.screen.cols - (this._getLeft(get) + this._getWidth(get));
        if (this.screen.autoPadding) {
            right += (this.options.positionParent || this.parent).iright;
        }
        return right;
    }

    right = (parent.aright || 0) + (this.position.right || 0);

    if (this.screen.autoPadding) {
        right += (this.options.positionParent || this.parent).iright;
    }

    return right;
};

blessed.Element.prototype._getTop = function (get) {
    var parent = get
            ? (this.options.positionParent || this.parent)._getPos()
            : this.options.positionParent || this.parent,
        top = (this.position && this.position.top) || 0,
        expr;

    if (typeof top === 'string') {
        if (top === 'center') top = '50%';
        expr = top.split(/(?=\+|-)/);
        top = expr[0];
        top = +top.slice(0, -1) / 100;
        top = (parent.height * top) | 0;
        top += +(expr[1] || 0);
        if (this.position.top === 'center') {
            top -= (this._getHeight(get) / 2) | 0;
        }
    }

    if (
        !!this.position &&
        this.position.top == null &&
        this.position.bottom != null
    ) {
        return this.screen.rows - this._getHeight(get) - this._getBottom(get);
    }

    if (this.screen.autoPadding) {
        if (
            !!this.position &&
            (this.position.top != null || this.position.bottom == null) &&
            this.position.top !== 'center'
        ) {
            top += (this.options.positionParent || this.parent).itop;
        }
    }

    return (parent.atop || 0) + top;
};

blessed.Element.prototype._getBottom = function (get) {
    var parent = get
            ? (this.options.positionParent || this.parent)._getPos()
            : this.options.positionParent || this.parent,
        bottom;

    if (this.position.bottom == null && this.position.top != null) {
        bottom = this.screen.rows - (this._getTop(get) + this._getHeight(get));
        if (this.screen.autoPadding) {
            bottom += (this.options.positionParent || this.parent).ibottom;
        }
        return bottom;
    }

    bottom = (parent.abottom || 0) + (this.position.bottom || 0);

    if (this.screen.autoPadding) {
        bottom += (this.options.positionParent || this.parent).ibottom;
    }

    return bottom;
};

blessed.Element.prototype.__defineGetter__('abottom', function () {
    return this._getBottom(false);
});

blessed.Element.prototype.__defineGetter__('rleft', function () {
    return this.aleft - (this.options.positionParent || this.parent).aleft;
});

blessed.Element.prototype.__defineGetter__('rright', function () {
    return this.aright - (this.options.positionParent || this.parent).aright;
});

blessed.Element.prototype.__defineGetter__('rtop', function () {
    return this.atop - (this.options.positionParent || this.parent).atop;
});

blessed.Element.prototype.__defineGetter__('rbottom', function () {
    return this.abottom - (this.options.positionParent || this.parent).abottom;
});

blessed.Element.prototype.__defineSetter__('aleft', function (val) {
    var expr;
    if (typeof val === 'string') {
        if (val === 'center') {
            val = (this.screen.width / 2) | 0;
            val -= (this.width / 2) | 0;
        } else {
            expr = val.split(/(?=\+|-)/);
            val = expr[0];
            val = +val.slice(0, -1) / 100;
            val = (this.screen.width * val) | 0;
            val += +(expr[1] || 0);
        }
    }
    val -= (this.options.positionParent || this.parent).aleft;
    if (this.position.left === val) return;
    this.emit('move');
    this.clearPos();
    return (this.position.left = val);
});

blessed.Element.prototype.__defineSetter__('aright', function (val) {
    val -= (this.options.positionParent || this.parent).aright;
    if (this.position.right === val) return;
    this.emit('move');
    this.clearPos();
    return (this.position.right = val);
});

blessed.Element.prototype.__defineSetter__('atop', function (val) {
    var expr;
    if (typeof val === 'string') {
        if (val === 'center') {
            val = (this.screen.height / 2) | 0;
            val -= (this.height / 2) | 0;
        } else {
            expr = val.split(/(?=\+|-)/);
            val = expr[0];
            val = +val.slice(0, -1) / 100;
            val = (this.screen.height * val) | 0;
            val += +(expr[1] || 0);
        }
    }
    val -= (this.options.positionParent || this.parent).atop;
    if (this.position.top === val) return;
    this.emit('move');
    this.clearPos();
    return (this.position.top = val);
});

blessed.Element.prototype.__defineSetter__('abottom', function (val) {
    val -= (this.options.positionParent || this.parent).abottom;
    if (this.position.bottom === val) return;
    this.emit('move');
    this.clearPos();
    return (this.position.bottom = val);
});
