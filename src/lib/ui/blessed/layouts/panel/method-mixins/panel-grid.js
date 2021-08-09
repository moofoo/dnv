class PanelGrid {
    prepGridItem(
        item,
        x,
        currentRow,
        currentCol,
        rowSpan,
        colSpan,
        rows,
        cols,
        rowArray,
        rowArrayIndex,
        itemsChange,
        addingItem
    ) {
        let [width, height] = [Math.floor(100 / cols), 100 / rows];

        item.panelGrid = true;

        item.refreshCoords = true;

        item.row = currentRow;
        item.col = rowArray ? rowArrayIndex : currentCol;
        item.colSpan = colSpan;
        item.rowSpan = rowSpan;
        item.columns = cols;

        item._ileft = undefined;
        item._itop = undefined;
        item._iright = undefined;
        item._ibottom = undefined;
        item._iwidth = undefined;
        item._iheight = undefined;

        item.style.border = this._border
            ? { ...this._border }
            : this.border
                ? { ...this.border }
                : { type: item === this.activeItem ? 'heavy' : 'line' };

        item.border = { ...item.style.border };

        item.style.border.fg = function () {
            let {
                focused,
                active,
                ready,
                inactiveOk,
                shellType,
                switching,
                promptOpen,
                popover,
            } = this;

            if (switching || promptOpen || popover) {
                return '#00ff00';
            }

            if (!ready || inactiveOk || shellType === 'script') {
                active = true;
            }

            let fg = '#006700';

            if (active) {
                if (focused) {
                    fg = '#00ff00';
                } else {
                    fg = '#006700';
                }
            } else {
                if (focused) {
                    fg = '#ff0000';
                } else {
                    fg = '#800000';
                }
            }

            return fg;
        }.bind(item);

        item.gridFocus = function () {
            this.border = this.border || {};
            this.style.border = this.style.border || {};

            this.border.type = 'heavy';
            this.style.border.type = 'heavy';

            this.screen.render();
        }.bind(item);

        item.gridBlur = function () {
            this.border = this.border || {};
            this.style.border = this.style.border || {};

            this.border.type = 'line';
            this.style.border.type = 'line';

            this.screen.render();
        }.bind(item);

        item.on('focus', item.gridFocus);
        item.on('blur', item.gridBlur);

        item.border.fg = item.style.border.fg;
        item.border.type = item.style.border.type;

        item.panelGridIndex = x;

        this.panelLabels[item.itemKey].hide();

        item.__setLabel(this.panelLabels[item.itemKey].getText(), {
            fg: function () {
                if (this.switching || this.promptOpen || this.popover) {
                    return 15;
                }

                return this.focused || this.selected ? 15 : '#b1b1b1';
            }.bind(item),
        });


        if (x >= cols || +currentRow > 0) {
            item.position.top = `${Math.floor(currentRow * height)}%-3`;
        } else {
            item.position.top = !item.noBorder && item.border && item.itop || 0;

        }

        if (currentCol + 1 === cols || width >= 99) {
            item.position.width = `${Math.ceil(width * colSpan)}%-1`;
        } else {
            item.position.width = `${Math.ceil(width * colSpan)}%`;
        }

        if (+currentCol === 0) {
            item.position.left = this.aleft - this.parent.aleft + 1;
        } else {
            item.position.left = `${Math.floor(currentCol * width)}%`;
        }

        if (x >= cols || +currentRow > 0) {
            item.position.height = `${Math.floor(height * rowSpan)}%+4`;

        } else {
            item.position.height = `${Math.floor(height * rowSpan)}%-4`;
        }

        item.resizeOnFocus = false;

        if (
            !this.itemMap[currentRow].includes(item.itemKey) &&
            this.itemMap[currentRow][currentCol] === ''
        ) {
            this.itemMap[currentRow][currentCol] = item.itemKey;
        }

        if (rowSpan > 1 || colSpan > 1) {
            for (let y = 0; y < rowSpan; y++) {
                for (let x = 0; x < colSpan; x++) {
                    if (!this.itemMap[currentRow + y]) {
                        this.itemMap[currentRow + y] = [];

                        for (let x = 0; x < cols; x++) {
                            this.itemMap[currentRow + y].push('');
                        }
                    }
                    if (this.itemMap[currentRow + y][currentCol + x] === '') {
                        this.itemMap[currentRow + y][currentCol + x] =
                            item.itemKey;
                    }
                }
            }
        }
    }

    prepGridItems(itemsChange = false, addingItem = false, cb) {
        this.itemMap = [];

        const items = this.activeItems;

        if (this.gridActive) {
            for (const item of items) {
                if (!item.parent) {
                    this.append(item);
                }

                if (item.hidden) {
                    item.show();
                }
            }
        }

        const colMap =
            this.activeKeys.length === 2
                ? [1, 1]
                : [2, this.activeKeys.length - 2];

        items.sort((a, b) => {
            if (a.itemKey === 'main') {
                return -1;
            }
            if (b.itemKey === 'main') {
                return 1;
            }
            if (a.itemKey.includes('metrics') && b.itemKey !== 'main') {
                return -1;
            }
            if (b.itemKey.includes('metrics') && a.itemKey !== 'main') {
                return 1;
            }

            if (
                a.options.termType === 'shell' &&
                b.options.termType !== 'shell'
            ) {
                return -1;
            }

            if (
                b.options.termType === 'shell' &&
                a.options.termType !== 'shell'
            ) {
                return 1;
            }

            return a.itemKey.length - b.itemKey.length;
        });

        this.activeKeys = [];

        items.forEach(item => {
            this.activeKeys.push(item.itemKey);
        });

        let rows = 2;

        let currentRow = 0;
        let currentCol = 0;

        let x = 0;

        let row = 0;

        let rowArrayIndex = 'rowArrayIndex';

        for (const item of items) {
            item.maximized = true;
            item.panelGrid = true;

            row = currentRow;

            let rowSpan = 1;

            let col = currentCol;
            let cols;
            let colSpan;

            if (rowArrayIndex >= 0) {
                rowArrayIndex++;
            }

            if (Array.isArray(colMap[row])) {
                cols = colMap[row].reduce((curr, arr) => arr + curr, 0); //colMap[row].length;

                if (rowArrayIndex === 'rowArrayIndex') {
                    rowArrayIndex = 0;
                }

                colSpan = colMap[row][rowArrayIndex];
            } else {
                cols = colMap[row];
                colSpan = 1;
            }

            if (!this.itemMap[row]) {
                this.itemMap[row] = [];
                for (let x = 0; x < cols; x++) {
                    this.itemMap[row].push('');
                }
            }

            if (row > 1) {
                if (x + 1 === this.activeKeys.length) {
                    if (colSpan === 1) {
                        if (currentCol + 1 < cols) {
                            colSpan = cols;
                        }
                    }
                    if (rowSpan === 1) {
                        if (currentRow + 1 < rows) {
                            rowSpan = rows;
                        }
                    }
                }
            }

            this.prepGridItem(
                item,
                x,
                currentRow,
                currentCol,
                rowSpan,
                colSpan,
                rows,
                cols,
                Array.isArray(colMap[row]),
                rowArrayIndex,
                itemsChange,
                addingItem
            );

            currentCol += colSpan;

            if (currentCol >= cols) {
                currentCol = 0;
                currentRow++;
            }

            x++;
        }

        if (itemsChange && !addingItem) {
            for (const item of Object.values(this.items)) {
                if (item.preResize) {
                    item.preResize();
                }

                if (item.resize) {
                    item.resize(true);
                } else {
                    item.emit('resize');
                }
            }
        }

        let map = [];
        const colSpans = {};

        for (let y = 0; y < this.itemMap.length; y++) {
            let row = [];

            for (let x = 0; x < this.itemMap[y].length; x++) {
                let key = this.itemMap[y][x];

                colSpans[key] = colSpans[key] || this.items[key].colSpan;

                if (!row.includes(key)) {
                    row.push(key);
                }
            }

            map.push(row);
        }

        this.itemMap = [...map];

        let max = 0;
        let diff = false;
        let index = 0;

        for (const row of this.itemMap) {
            if (row.length > max) {
                max = row.length;
                if (index > 0) {
                    diff = true;
                }
            }

            index++;
        }

        if (diff) {
            map = [];
            for (const row of this.itemMap) {
                if (row.length === max) {
                    map.push(row);
                    continue;
                }

                const newRow = [];

                let toAdd = Math.floor(max / row.length);

                let biggerSpanKey = '';
                let spanCount = 0;

                for (const key of row) {
                    if (colSpans[key] > spanCount) {
                        spanCount = colSpans[key];
                        biggerSpanKey = key;
                    }

                    for (let x = 0; x < toAdd; x++) {
                        newRow.push(key);
                    }
                }

                const key = biggerSpanKey;
                while (newRow.length < max) {
                    newRow.splice(newRow.indexOf(key), 0, key);
                }

                map.push(newRow);
            }

            this.itemMap = map;
        }

        if (cb) {
            cb();
        }
    }

    maximize({
        top,
        left,
        width,
        height,
        xOffset,
        yOffset,
        panelGrid,
        resize,
    }) {
        if (this.maximizing) {
            return;
        }

        let toGrid = false;


        if (panelGrid && this.activeKeys.length > 1) {
            this.noBorder = true;
            toGrid = true;
            top -= 1;
            left -= 1;

            width = `${width}+1`;
            height = `${height}-${Math.abs(yOffset)}`;
        } else {
            width = `${width}`;
            height = `${height}-${Math.abs(yOffset)}`;

        }

        for (const item of this.activeItems) {
            item.switching = false;
            item.popover = false;
            item.promptOpen = false;

            if (item && item.parent) {
                item.refreshCoords = true;

                if (item.preResize) {
                    item.preResize(false, toGrid);
                }

                if (!toGrid && item.hidden) {
                    item.resizeOnFocus = true;
                }
            }
        }


        if (
            this.position.width === width &&
            this.position.height === height &&
            this.position.top === top &&
            this.position.left === left
        ) {
            return;
        }

        this.setPos({
            width,
            left,
            top,
            height,
        });

        this.maximizing = true;

        if (toGrid) {
            this.gridCount = this.activeKeys.length;
            this.gridActive = true;

            this.updateLabels();
            this.prepGridItems();
        }

        resize();

        this.resize();

        for (const item of this.activeItems) {
            item.maximized = true;
        }

        this.parent.debug(this.itemMap);

        setTimeout(() => {
            if (this.activeHelp) {
                this.activeHelp.show();
            }

            this.screen.render();

            this.maximizing = false;
        });
    }

    unGridItem(item) {
        item.panelGrid = false;
        item.maximized = false;

        item.position.width = '100%-2';
        item.position.height = '100%-2';
        item.position.left = 0; // this.gridActive ? -1 : 0;
        item.position.top = 0; // this.gridActive ? -1 : 0;

        item._ileft = 0;
        item._itop = 0;
        item._iright = 0;
        item._ibottom = 0;
        item._iwidth = 0;
        item._iheight = 0;

        item.border = null;
        item.style.border = {}

        item.off('focus', item.gridFocus);
        item.off('blur', item.gridBlur);

        if (item._label) {
            item._label.destroy();
            item._label = null;
        }

        if (this.panelLabels[item.itemKey]) {
            this.panelLabels[item.itemKey].show();
        }

        if (item.recalc) {
            item.recalc();
        }

        item.emit('grid off');
    }

    minimize({ top, left, width, height, minimizer }) {
        if (this.minimizing) {
            return;
        }

        this.noBorder = false;

        if (
            this.position.width === width &&
            this.position.height === height &&
            this.position.top === top &&
            this.position.left === left
        ) {
            return;
        }

        for (const item of this.activeItems) {
            item._border = (item.border && { ...item.border }) || item._border;
            item.border = null;
            item.style.border = {}

            item.switching = false;
            item.popover = false;
            item.promptOpen = false;
            item.maximized = false;
            item.panelGrid = false;

            this.unGridItem(item);

            if (item !== this.activeItem && this.gridActive) {
                item.hide();
                item.resizeOnFocus = true;
            } else if (item === this.activeItem && !this.activeItem.hidden && this.activeItem.preResize) {
                this.activeItem.preResize();
            }
        }

        this.setPos({
            width,
            left,
            top,
            height,
        });

        this.minimizing = true;
        this.nextTicks = [];

        if (minimizer) {
            this.screen.program.closing = true;

            setTimeout(() => {
                this.screen.program.closing = false;
            }, 50);
        }

        if (this.gridActive) {
            this.screen.ignoreLocked = [...this.screen.defIgnoreLocked];
            this.gridActive = false;
            this.gridCount = 0;
        } else {
            for (const item of this.activeItems) {
                item.maximized = false;

                if (item.itemKey !== this.activeKey) {
                    item.hide();
                    item.resizeOnFocus = true;
                }
            }
        }

        this.resize();

        if (this.activeItem) {
            this.activeItem.resizeOnFocus = false;


            if (this.activeItem.resize) {
                this.activeItem.resize();
            } else {
                this.activeItem.emit('resize');

                this.showItem(this.activeKey, true, minimizer);
            }
        }

        if (!minimizer) {
            this.selected = false;
            this.onBlur();
        }

        setTimeout(() => {
            this.updateLabels();

            if (!this.selected && !this.gridActive && this.activeHelp) {
                this.activeHelp.hide();
            }

            this.screen.render();
            this.minimizing = false;
        });
    }
}

module.exports = PanelGrid;
