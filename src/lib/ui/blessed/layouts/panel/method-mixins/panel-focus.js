class PanelFocus {
    selectSubPanel(itemKey) {
        if (this.selected && this.activeKeys.length > 1) {
            this.subPanelSelect = true;

            if (this.activeItem && this.activeItem.popover) {
                return;
            }
            if (!this.gridActive && this.activeItem && this.activeItem.blur) {
                this.activeItem.blur();
            }

            if (this.items[itemKey]) {
                this.items[itemKey].focus();
            }

            process.nextTick(() => {
                this.subPanelSelect = false;
            });
        }
    }

    focusUp() {
        const item = this.activeItem;

        const mapKey = this.options.mapKey;

        const coords = {
            row: item.row,
            col: item.col,
            rowSpan: item.rowSpan,
            colSpan: item.colSpan,
        };

        let upItem;
        let col = coords.col;
        let row = coords.row - 1;

        if (!this.itemMap[row]) {
            row = this.itemMap.length - 1;
        }

        if (!this.itemMap[row][col]) {
            if (col > Math.floor(this.itemMap[coords.row].length) / 2) {
                col = this.itemMap[row].lastIndexOf(item[mapKey]);
            } else {
                col = this.itemMap[row].indexOf(item[mapKey]);
            }

            if (!this.itemMap[row][col]) {
                col = 0;
            }
        }

        upItem = this.itemMap[row][col];

        if (upItem) {
            this.selectSubPanel(upItem);
        }
    }

    focusDown() {
        const item = this.activeItem;

        const mapKey = this.options.mapKey;

        const coords = {
            row: item.row,
            col: item.col,
            rowSpan: item.rowSpan,
            colSpan: item.colSpan,
        };

        let downItem;

        let col = coords.col;
        let row = coords.row + 1;

        if (!this.itemMap[coords.row + 1]) {
            row = 0;
        }

        if (!this.itemMap[row][col]) {
            if (col > Math.floor(this.itemMap[coords.row].length) / 2) {
                col = this.itemMap[row].lastIndexOf(item[mapKey]);
            } else {
                col = this.itemMap[row].indexOf(item[mapKey]);
            }

            if (!this.itemMap[row][col]) {
                col = this.itemMap[row].length - 1;
            }
        }

        downItem = this.itemMap[row][col];

        if (downItem) {
            this.selectSubPanel(downItem);
        }
    }

    focusLeft() {
        const item = this.activeItem;

        const mapKey = this.options.mapKey;

        const coords = {
            row: item.row,
            col: item.col,
            rowSpan: item.rowSpan,
            colSpan: item.colSpan,
        };

        let row = coords.row;
        let col = coords.col - 1;

        let leftItem = this.itemMap[row][col];

        if (leftItem && leftItem === item.itemKey) {
            while (leftItem === item.itemKey) {
                col -= 1;
                leftItem = this.itemMap[row][col];
            }
        }

        const prevRowItem =
            this.itemMap[row - 1] &&
            this.itemMap[row - 1][this.itemMap[row - 1].length - 1];

        const lastRowItem =
            this.itemMap[this.itemMap.length - 1][
                this.itemMap[this.itemMap.length - 1].length - 1
            ];

        if (leftItem) {
            this.selectSubPanel(leftItem);
            return;
        }

        if (prevRowItem) {
            this.selectSubPanel(prevRowItem);
            return;
        }

        this.selectSubPanel(lastRowItem);
    }

    focusRight() {
        const item = this.activeItem;

        const mapKey = this.options.mapKey;

        const coords = {
            row: item.row,
            col: item.col,
            rowSpan: item.rowSpan,
            colSpan: item.colSpan,
        };

        let row = coords.row;
        let col = coords.col + 1;

        let rightItem = this.itemMap[row][col];

        if (rightItem && rightItem === item.itemKey) {
            while (rightItem === item.itemKey) {
                col += 1;
                rightItem = this.itemMap[row][col];
            }
        }

        const nextRowItem =
            this.itemMap[coords.row + 1] && this.itemMap[coords.row + 1][0];

        const firstRowItem = this.itemMap[0][0];

        if (rightItem) {
            this.selectSubPanel(rightItem);
            return;
        }

        if (nextRowItem) {
            this.selectSubPanel(nextRowItem);
            return;
        }

        this.selectSubPanel(firstRowItem);
    }
}

module.exports = PanelFocus;
