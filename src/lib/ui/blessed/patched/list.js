const blessed = require('blessed');

/*
    These patches add the following:
    1. List navigation looping (pressing up when the first item is selected selects the last item, etc). Based on .options.loop flag
    2. The widget can now handle arbitrary values for list items, instead of being limited to strings
    3. Scrollbar visibility based on need
*/

blessed.List.prototype.select = function (index) {
    if (!this.interactive) {
        return;
    }

    if (!this.items.length) {
        this.selected = 0;
        this.value = '';
        this.scrollTo(0);
        return;
    }

    if (typeof index === 'object' && index.getContent) {
        index = this.items.indexOf(index);
    } else if (typeof index === 'object' && index.name) {
        index = this.ritems.indexOf(index);
    }

    const lessThan = index < 0;
    const greaterThan = index >= this.items.length;

    if ((lessThan || greaterThan) && !this.options.loop) {
        return;
    } else if (this.options.loop) {
        if (index < 0) {
            index = 0;
        } else if (index >= this.items.length) {
            index = this.items.length - 1;
        }
    }

    if (this.selected === index && this._listInitialized) return;
    this._listInitialized = true;

    this.selected = index;
    const itemValue = this.ritems[this.selected];

    this.value =
        typeof itemValue === 'string'
            ? blessed.helpers.cleanTags(itemValue)
            : itemValue;

    if (!this.parent) return;
    this.scrollTo(this.selected);

    /*
        Interesting idea that needs work.

        Colors the top-right/bottom-left border to indicate that scrolling is possible
        (list height less than item count)

    if (
        this.options.borderMark &&
        this.items.length > this.height - this.iheight - 1
    ) {
        if (!this._markResizeAdded) {
            this._markResizeAdded = true;

            this.on('resize', () => {
                this.resizeTimeout =
                    this.resizeTimeout ||
                    setTimeout(() => {
                        this.setScrollMark();
                        this.resizeTimeout = null;
                    }, 250);
            });
        }

        this.setScrollMark();
    }
    */

    // XXX Move `action` and `select` events here.

    this.emit(
        'select item',
        this.items[this.selected],
        this.selected,
        itemValue
    );
};

blessed.List.prototype.setScrollMark = function () {
    if (!this.options.borderMark) {
        this.borderMark = null;
        return;
    }

    if (this.items.length > this.height - this.iheight - 1) {
        if (this.childBase === 0) {
            this.borderMark = ['bottom-right'];
        } else if (this.childBase > 0) {
            if (
                this.childBase + this.height - this.iheight >=
                this.items.length
            ) {
                this.borderMark = ['top-right'];
            } else {
                this.borderMark = ['top-right', 'bottom-right'];
            }
        }
    } else {
        this.borderMark = null;
    }
};

blessed.List.prototype.setItems = function (items) {
    this.mouseSet = this.mouseSet !== undefined ? this.mouseSet : false;

    if (!this.mouseSet && this.options.mouse) {
        this.mouseSet = true;
        this.outsideInterval = null;
        this.isInside = false;

        this.off('element wheeldown');
        this.off('element wheelup');

        if (this.options.insideWheel !== false) {
            this.on('element wheeldown', () => {
                this.select(this.selected + 1);
                this.screen.render();
            });
            this.on('element wheelup', () => {
                this.select(this.selected - 1);
                this.screen.render();
            });
        }

        /*
            This is an interesting idea but the implementation needs work work.

            The gist: when the list has hidden items (can scroll up or down), if the cursor
            enters the list element and then goes outside it directly above or below, the list will scroll in that
            direction.


        if (this.options.outsideMove) {


            const doLoop = this.options.loop;

            this.on('mouseover', () => {
                if (this.outsideInterval !== null) {
                    clearInterval(this.outsideInterval);
                    this.outsideInterval = null;

                    this.isInside = true;
                }
            });

            this.on('out-move', (data, location) => {
                if (location === false) {
                    if (this.outsideInterval !== null) {
                        clearInterval(this.outsideInterval);
                        this.outsideInterval = null;
                    }

                    this.isInside = true;

                    return;
                }

                if (
                    this.isInside &&
                    location.where === 'above' &&
                    this.outsideInterval === null
                ) {
                    this.outsideInterval = setInterval(() => {
                        this.options.loop = false;
                        this.select(this.selected - 1);
                        this.screen.render();

                        if (doLoop) {
                            this.options.loop = true;
                        }
                    }, 150);
                    return;
                } else if (
                    this.isInside &&
                    location.where === 'below' &&
                    this.outsideInterval === null
                ) {
                    this.outsideInterval = setInterval(() => {
                        this.options.loop = false;
                        this.select(this.selected + 1);
                        this.screen.render();

                        if (doLoop) {
                            this.options.loop = true;
                        }
                    }, 150);
                    return;
                } else if (
                    this.isInside &&
                    !['above', 'below'].includes(location.where)
                ) {
                    clearInterval(this.outsideInterval);
                    this.outsideInterval = null;
                    this.isInside = false;
                    if (doLoop) {
                        this.options.loop = true;
                    }
                } else if (!this.isInside) {
                    clearInterval(this.outsideInterval);
                    this.outsideInterval = null;
                    if (doLoop) {
                        this.options.loop = true;
                    }
                }
            });
        }
              */
    }

    var original = this.items.slice(),
        selected = this.selected,
        sel = this.ritems[this.selected],
        i = 0;

    items = items.slice();
    let displays = items;
    let names = items;

    if (typeof items[0] === 'object') {
        displays = items.map((item) => item.display || item.name);
        names = items.map((item) => item.name);
    }

    this.select(0);

    for (; i < items.length; i++) {
        if (this.items[i]) {
            this.items[i].setContent(displays[i]);
        } else {
            this.add(items[i]);
        }
    }

    for (; i < original.length; i++) {
        this.remove(original[i]);
    }

    this.ritems = items;

    // Try to find our old item if it still exists.
    sel = sel && names.indexOf(sel.name);
    if (~sel) {
        this.select(sel);
    } else if (items.length === original.length) {
        this.select(selected);
    } else {
        this.select(Math.min(selected, items.length - 1));
    }

    this.emit('set items');
};

blessed.List.prototype.setItem = function (child, content) {
    content =
        typeof content === 'string'
            ? content
            : content.getContent
            ? content.getContent()
            : content;

    let display =
        typeof content === 'object' ? content.display || content.name : content;

    var i = this.getItemIndex(child);
    if (!~i) return;
    this.items[i].setContent(display);
    this.ritems[i] = content;
};

blessed.List.prototype.add =
    blessed.List.prototype.addItem =
    blessed.List.prototype.appendItem =
        function (content) {
            content =
                typeof content === 'string'
                    ? content
                    : content.getContent
                    ? content.getContent()
                    : content;

            var item = this.createItem(content);
            item.position.top = this.items.length;
            if (!this.screen.autoPadding) {
                item.position.top = this.itop + this.items.length;
            }

            this.ritems.push(content);
            this.items.push(item);
            this.append(item);

            if (this.items.length === 1) {
                this.select(0);
            }

            this.emit('add item');

            return item;
        };

blessed.List.prototype.createItem = function (content) {
    var self = this;
    let display = content;

    if (typeof content === 'object') {
        display = content.display || content.name;
    }
    // Note: Could potentially use Button here.
    var options = {
        screen: this.screen,
        content: display,
        align: this.align || 'left',
        top: 0,
        left: 0,
        right: this.scrollbar ? 1 : 0,
        tags: this.parseTags,
        height: 1,
        hoverEffects: this.mouse ? this.style.item.hover : null,
        focusEffects: this.mouse ? this.style.item.focus : null,
        autoFocus: false,
        focused: false,
    };

    if (!this.screen.autoPadding) {
        options.top = 1;
        options.left = this.ileft;
        options.right = this.iright + (this.scrollbar ? 1 : 0);
    }

    // if (this.shrink) {
    // XXX NOTE: Maybe just do this on all shrinkage once autoPadding is default?
    if (this.shrink && this.options.normalShrink) {
        delete options.right;
        options.width = 'shrink';
    }

    [
        'fg',
        'bg',
        'bold',
        'underline',
        'blink',
        'inverse',
        'invisible',
        'saturate',
        'desaturate',
        'lighten',
        'darken',
    ].forEach(function (styleName) {
        options[styleName] = function () {
            var attr =
                self.items[self.selected] === item && self.interactive
                    ? self.style.selected[styleName]
                    : self.style.item[styleName];
            if (typeof attr === 'function') attr = attr(item);
            return attr;
        };
    });

    if (this.style.transparent) {
        options.transparent = true;
    }

    var item = new blessed.Box(options);

    item.dattr = item.sattr({ fg: 'white', bg: 'black' });

    item.itemName = typeof content === 'object' ? content.name : content;

    if (this.mouse) {
        item.on('click', function () {
            self.focus();
            if (self.items[self.selected] === item) {
                self.emit('action', item, self.selected);
                self.emit('select', item, self.selected);
                return;
            }
            self.select(item);
            self.screen.render();
        });

        item.on('mouseover', function () {
            if (this.outsideInterval !== null) {
                clearInterval(this.outsideInterval);
                this.outsideInterval = null;
            }

            this.isInside = true;

            self.select(item);
            self.screen.render();
        });
    }

    item.on('focus', function () {
        self.focus();
    });

    this.emit('create item');

    return item;
};

blessed.List.prototype.insertItem = function (child, content) {
    content =
        typeof content === 'string'
            ? content
            : content.getContent
            ? content.getContent()
            : content;

    var i = this.getItemIndex(child);
    if (!~i) return;
    if (i >= this.items.length) return this.appendItem(content);
    var item = this.createItem(content);
    for (var j = i; j < this.items.length; j++) {
        this.items[j].position.top++;
    }
    item.position.top = i + (!this.screen.autoPadding ? 1 : 0);
    this.ritems.splice(i, 0, content);
    this.items.splice(i, 0, item);
    this.append(item);
    if (i === this.selected) {
        this.select(i + 1);
    }
    this.emit('insert item');
};

blessed.List.prototype.enterSelected = function (i) {
    if (i != null) this.select(i);
    this.emit('action', this.items[this.selected], this.selected, this.value);
    this.emit('select', this.items[this.selected], this.selected, this.value);
};

blessed.List.prototype.getItemByName = function (name) {
    return this.items.find((item) => item.itemName === name);
};

blessed.List.prototype.up = function (offset) {
    const tomove = -(offset || 1);
    if (this.selected + tomove < 0) {
        this.select(this.items.length - 1);
    } else {
        this.move(tomove);
    }
};

blessed.List.prototype.down = function (offset) {
    const tomove = offset || 1;
    if (this.selected + tomove > this.items.length - 1) {
        this.select(0);
    } else {
        this.move(tomove);
    }
};
