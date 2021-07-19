const blessed = require('blessed');
const omit = require('lodash.difference');
const merge = require('lodash.merge');
const cloneDeep = require('lodash.clonedeep');
const debounce = require('lodash.debounce');
const throttle = require('lodash.throttle');
const { throwError } = require('rxjs');

class Grid extends blessed.Box {
    constructor(opts = {}) {
        const options = merge(
            {},
            {
                processKeys: true,
                rows: 'auto',
                cols: 2,
                perPage: 4,
                yOffset: 0,
                xOffset: 0,
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                mapKey: 'key',
                mouse: false,
                clickable: false,
            },
            opts
        );

        super(options);

        this.options = options;

        this.items = [...this.options.items];

        this.itemIds = [];

        for (const item of this.items) {
            item.id = `${Math.floor(Math.random() * (9999 - 1001) + 1000)}`;
            this.itemIds.push(item.id);
        }

        this.processKeys = options.processKeys;

        this.label = this.options.label;

        this.focusedIndexOnPage = { 0: 0 };

        this.debug = this.debug.bind(this); /*throttle(
        ,
            100
        ); /* debounce(this.debug.bind(this), 50, {
            trailing: true,
            leading: true,
        });*/

        this.screen.debug = this.debug.bind(this);

        this.screen.program.debug = this.debug.bind(this);

        this.currentPage = 0;
        this.pages = 1;

        this.firstInit = true;

        this.addedItems = [];

        this.toActivate = [];

        this.recalc = this.recalc.bind(this);
        this.onKeypress = this.onKeypress.bind(this);
        this.onMouse = this.onMouse.bind(this);

        this.debouncedResize = debounce(this.resize.bind(this), 80, {
            leading: false,
            trailing: true,
        });

        this.initEvents();

        if (!this.options.parentActivate) {
            this.arrangeItems();
        }

        if (this.toActivate && !this.options.parentActivate) {
            (async () => {
                await this.activate();
                this.postInit();
            })();
        } else if (!this.options.parentActivate) {
            this.postInit();
        }
    }

    get type() {
        return 'grid';
    }

    get focusedIndex() {
        return this.focusedIndexOnPage[this.currentPage];
    }

    set focusedIndex(value) {
        const index = this.getItemIndex(value);

        this.focusedIndexOnPage[this.currentPage] = index;
    }

    get focusedCoords() {
        const item = this.getFocusedItem();

        return {
            row: item.options.row,
            col: item.options.col,
            rowSpan: item.options.rowSpan,
            colSpan: item.options.colSpan,
        };
    }

    postInit() {}

    async activate() {
        if (this.options.parentActivate) {
            this.arrangeItems();
        }

        if (this.toActivate || this.options.parentActivate) {
            let firstChild;
            for (const child of this.children) {
                if (!this.itemIds.includes(child.id)) {
                    continue;
                }

                if (!firstChild && child.options.key !== 'debug') {
                    firstChild = child;
                }

                if (
                    child.activate &&
                    typeof child.activate === 'function' &&
                    !child.activated
                ) {
                    if (this.options.itemKey === 'metrics1') {
                        let opts = {};

                        for (const key of Object.keys(child.options)) {
                            if (['screen', 'parent', 'widget'].includes(key)) {
                                continue;
                            }

                            opts[key] = child.options[key];
                        }
                    }
                    await child.activate();
                } else {
                    child.activated = true;
                }
            }

            if (this.firstInit && this.parent === this.screen) {
                this.focusChild = firstChild;
                this.firstInit = false;
            }

            if (this.options.parentActivate) {
                this.postInit();
            } else {
                this.screen.render();
            }
        }
    }

    initItem(opts) {
        opts.key = opts.key || this.options.key;

        const Widget = opts.widget;

        opts.screen = this.screen;
        opts.parent = this;
        opts.parentActivate = true;

        opts.debug = this.debug.bind(this);

        let el = new Widget(opts);

        el.key = opts.key;

        if (opts.row === 0 && opts.atop) {
            el.atop = opts.atop;
        }

        if (opts.col === 0 && opts.aleft) {
            el.aleft = opts.aleft;
        }

        el.maximized = false;

        el.id = el.id || el.options.id;

        if (el.activate && this.firstInit) {
            this.toActivate = true;
        } else if (el.activate) {
            el.activate();
        }
    }

    initItems() {
        for (const opts of this.items) {
            this.initItem(opts);
        }
    }

    getGutters(row, col) {
        const gutters = {
            top: 0,
            height: 0,
            left: 0,
            width: 0,
        };

        if (this.options.gutters) {
            let offset;
            if (typeof this.options.gutters === 'object') {
                if (this.options.gutters.horizontal > 0) {
                    offset =
                        this.options.gutters.horizontal === 1
                            ? this.options.gutters.horizontal
                            : Math.floor(this.options.gutters.horizontal / 2);

                    if (row === 0) {
                        gutters.height = offset * -1;
                    } else {
                        gutters.height = offset * -1;
                        gutters.top = offset;
                    }
                }

                if (this.options.gutters.vertical > 0) {
                    offset =
                        this.options.gutters.vertical === 1
                            ? this.options.gutters.vertical
                            : Math.floor(this.options.gutters.vertical / 2);

                    if (col === 0) {
                        gutters.width = offset * -1;
                    } else {
                        gutters.width = offset * -1;
                        gutters.left = offset;
                    }
                }
            } else {
                offset =
                    this.options.gutters === 1
                        ? this.options.gutters
                        : Math.floor(this.options.gutters / 2);

                if (row === 0) {
                    gutters.height = offset * -1;
                } else {
                    gutters.height = offset * -1;
                    gutters.top = offset;
                }

                if (col === 0) {
                    gutters.width = offset * -1;
                } else {
                    gutters.width = offset * -1;
                    gutters.left = offset;
                }
            }
        }

        return gutters;
    }

    recalc() {
        if (!this.parent) {
            return;
        }

        for (const child of this.children) {
            if (!this.itemIds.includes(child.id)) {
                continue;
            }

            const opts = this.getDimensions(child.options, this.options);

            [
                'row',
                'col',
                'rows',
                'cols',
                'colSpan',
                'rowSpan',
                'width',
                'height',
            ].forEach((key) => {
                child.options[key] = opts[key];
            });

            if (opts.row === 0 && opts.atop) {
                child.atop = opts.atop;
            } else {
                child.top = opts.top;
            }

            if (opts.col === 0 && opts.aleft) {
                child.aleft = opts.aleft;
            } else {
                child.left = opts.left;
            }

            child.width = opts.width;
            child.height = opts.height;
        }

        this.screen.render();
    }

    getDimensions(opts, options) {
        if (!this.parent) {
            return;
        }

        const { row, col, rows, cols, rowSpan, colSpan } = opts;

        const [width, height] = [100 / cols, 100 / rows];

        options = options || this.options;

        const gutters = this.getGutters(row, col);

        const heightOffsetVal =
            this.panelGrid &&
            options.panelGrid &&
            options.panelGrid.heightOffset
                ? options.panelGrid.heightOffset
                : options.heightOffset;

        const widthOffsetVal =
            this.panelGrid && options.panelGrid && options.panelGrid.widthOffset
                ? options.panelGrid.widthOffset
                : options.widthOffset;

        const xOffsetVal =
            this.panelGrid && options.panelGrid && options.panelGrid.xOffset
                ? options.panelGrid.xOffset
                : options.xOffset;

        const yOffsetVal =
            this.panelGrid && options.panelGrid && options.panelGrid.yOffset
                ? options.panelGrid.yOffset
                : options.yOffset;

        let heightOffset = Array.isArray(heightOffsetVal)
            ? heightOffsetVal[row]
            : heightOffsetVal || 0;

        let heightSign = '-';

        let widthOffset = Array.isArray(widthOffsetVal)
            ? widthOffsetVal[col]
            : widthOffsetVal || 0;

        let widthSign = '-';

        let xOffset = Array.isArray(xOffsetVal)
            ? xOffsetVal[col]
            : xOffsetVal || 0;

        let xSign = '-';

        let yOffset = Array.isArray(yOffsetVal)
            ? yOffsetVal[row]
            : yOffsetVal || 0;

        let ySign = '-';

        if (Math.abs(gutters.height) > 0) {
            heightOffset += gutters.height;
        }

        if (Math.abs(gutters.width) > 0) {
            widthOffset += gutters.width;
        }

        if (row > 0 && Math.abs(gutters.top) > 0) {
            yOffset += gutters.top;
        }

        if (col > 0 && Math.abs(gutters.left) > 0) {
            xOffset += gutters.left;
        }

        if (heightOffset > 0) {
            heightSign = '+';
        } else if (heightOffset === 0) {
            heightSign = '';
        }

        if (widthOffset > 0) {
            widthSign = '+';
        } else if (widthOffset === 0) {
            widthSign = '';
        }

        if (xOffset > 0) {
            xSign = '+';
        } else if (xOffset === 0) {
            xSign = '';
        }

        if (yOffset > 0) {
            ySign = '+';
        } else if (yOffset === 0) {
            ySign = '';
        }

        if (this.options.heightFn) {
            opts.height = this.options.heightFn({
                row,
                rows,
                height,
                rowSpan,
                heightSign,
                heightOffset,
                parentHeight: this.parent.height,
            });
        } else {
            opts.height = `${Math.floor(height * rowSpan)}%${heightSign}${
                heightOffset !== 0 ? Math.abs(heightOffset) : ''
            }`;
        }

        if (this.options.widthFn) {
            opts.width = this.options.widthFn({
                col,
                cols,
                colSpan,
                width,
                widthSign,
                widthOffset,
                parentWidth: this.parent.width,
            });
        } else {
            opts.width = `${Math.ceil(width * colSpan)}%${widthSign}${
                widthOffset !== 0 ? Math.abs(widthOffset) : ''
            }`;
        }

        if (row === 0) {
            opts.atop = this.atop + yOffset;
        }

        opts.top = `${Math.floor(row * height)}%${ySign}${
            yOffset !== 0 ? Math.abs(yOffset) : ''
        }`;

        if (col === 0) {
            opts.aleft = this.aleft + xOffset;
        }

        opts.left = `${Math.floor(col * width)}%${xSign}${
            xOffset !== 0 ? Math.abs(xOffset) : ''
        }`;

        return opts;
    }

    arrangeItem(
        opts,
        x,
        currentRow,
        currentCol,
        rows,
        cols,
        rowSpan,
        colSpan,
        currentPage,
        colSpanIndex,
        options
    ) {
        options = options || this.options;

        rows = rows || options.rows;
        cols = cols || options.cols;

        const mapKey = options.mapKey;

        const [width, height] = [100 / cols, 100 / rows];

        const row = currentRow;
        const col = currentCol;

        opts = {
            ...opts,
            row,
            col,
            colSpan,
            rowSpan,
            visible: currentPage === 0,
            hidden: currentPage > 0,
            page: currentPage,
            gridIndex: x,
            firstOnPage: currentRow === 0 && currentCol === 0,
            width,
            height,
            rows,
            cols,
            colSpanIndex,
            currentPage,
        };

        opts.col = colSpanIndex !== -1 ? colSpanIndex : currentCol;

        opts = this.getDimensions(opts, options);

        if (colSpanIndex !== -1) {
            this.itemMap[currentPage][currentRow][currentCol] = opts[mapKey];
        } else if (
            !this.itemMap[currentPage][currentRow].includes(opts[mapKey]) &&
            this.itemMap[currentPage][currentRow][currentCol] === ''
        ) {
            this.itemMap[currentPage][currentRow][currentCol] = opts[mapKey];
        }

        if (rowSpan > 1 || colSpan > 1) {
            for (let y = 0; y < rowSpan; y++) {
                for (let x = 0; x < colSpan; x++) {
                    if (!this.itemMap[currentPage][currentRow + y]) {
                        this.itemMap[currentPage][currentRow + y] = [];

                        for (let x = 0; x < cols; x++) {
                            this.itemMap[currentPage][currentRow + y].push('');
                        }
                    }

                    if (
                        colSpanIndex !== -1 ||
                        this.itemMap[currentPage][currentRow + y][
                            currentCol + x
                        ] === ''
                    ) {
                        this.itemMap[currentPage][currentRow + y][
                            currentCol + x
                        ] = opts[mapKey];
                    }
                }
            }
        }

        return opts;
    }

    arrangeOthers(items, colSpans, options, cb) {
        this.arrangeItems('set', colSpans, items, options, cb);
    }

    arrangeItems(action = 'init', colSpans, children, options, cb) {
        options = options || this.options;

        let { rows, cols, perPage } = options;

        this.cloneMap = null;

        if (this.itemMap && this.itemMap.length) {
            this.cloneMap = cloneDeep(this.itemMap);
        }

        let startCols = cols;

        colSpans = colSpans || options.colSpans || {};

        if (rows === 'auto') {
            rows = Math.ceil(perPage / cols);
            options.rows = rows;
        }

        this.itemMap = [];

        let pageMap = [];

        for (let x = 0; x < rows; x++) {
            pageMap[x] = [];
            for (let y = 0; y < cols; y++) {
                pageMap[x].push('');
            }
        }

        this.itemMap.push([...pageMap]);

        let currentRow = 0;
        let currentCol = 0;
        let currentPage = 0;
        let index = 0;

        children = children || this.children;

        const items =
            action === 'init'
                ? this.items
                : children.map((child) => child.options);

        let colSpanIndex = -1;
        let rowSpanIndex = -1;
        this.colSpanCount = -1;

        this.rowSpanCount = -1;

        let remainder = items.length;

        let onPage = 0;

        let rowSpan = 1;
        let colSpan = 1;

        const spansByKey = {};

        for (let opts of items) {
            let row = null;
            let col = null;
            let newPage = false;

            if (index > 0 && index % perPage === 0) {
                newPage = true;
                onPage = 0;
                this.pages++;
                currentPage++;
                let pageMap = [];

                for (let x = 0; x < rows; x++) {
                    pageMap[x] = [];
                    for (let y = 0; y < cols; y++) {
                        pageMap[x].push('');
                    }
                }

                this.itemMap.push([...pageMap]);
                // if (currentPage > 0) {
                this.focusedIndexOnPage[currentPage] = index;
                //}

                currentCol = 0;
                currentRow = 0;
            }

            onPage++;

            if (row === null) {
                row = currentRow;
            }

            if (col === null) {
                col = currentCol;
            }

            colSpan = 1;
            rowSpan = 1;

            if (newPage) {
                cols = 1;
                rows = 2;
                startCols = 1;
                startRows = 2;
            } else {
                if (colSpans[row]) {
                    if (colSpanIndex >= 0) {
                        colSpanIndex++;
                    }

                    if (Array.isArray(colSpans[row])) {
                        cols = colSpans[row].reduce(
                            (curr, arr) => arr + curr,
                            0
                        );

                        if (colSpanIndex === -1) {
                            colSpanIndex = 0;
                        }

                        colSpan = colSpans[row][colSpanIndex];
                    } else {
                        if (colSpans[row] === 'rest') {
                            if (perPage <= onPage) {
                                perPage += 1;
                            }

                            if (col >= cols) {
                                cols += cols - col;
                            }
                        } else if (typeof colSpans[row] === 'number') {
                            cols = colSpans[row];
                        }
                    }
                } else {
                    colSpanIndex = -1;
                    cols = startCols;
                    colSpan = 1;
                }
            }

            if (!this.itemMap[this.currentPage][row]) {
                this.itemMap[this.currentPage][row] = [];
                for (let y = 0; y < cols; y++) {
                    this.itemMap[this.currentPage][row].push('');
                }
            }

            if (!newPage) {
                const cSpans = colSpans || {};

                if (rowSpan === 1) {
                    if (
                        col + 2 === cols &&
                        index + 2 === this.options.items.length
                    ) {
                        if (currentRow + 1 < rows) {
                            rowSpan = rows;
                        }
                    }
                }

                if (index + 1 === this.options.items.length) {
                    if (!cSpans[row] && colSpan === 1) {
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

            colSpan = colSpan || 1;
            rowSpan = rowSpan || 1;

            opts = this.arrangeItem(
                opts,
                index,
                row,
                col,
                rows,
                cols,
                rowSpan,
                colSpan,
                currentPage,
                colSpanIndex,
                options
            );

            this.items[index] = {
                ...this.items[index],
                ...opts,
            };

            if (action === 'init') {
                this.initItem(opts);
            } else if (cb) {
                const child = children[index];

                [
                    'row',
                    'col',
                    'rows',
                    'cols',
                    'colSpan',
                    'rowSpan',
                    'width',
                    'height',
                ].forEach((key) => {
                    child.options[key] = opts[key];
                });

                if (opts.row === 0 && opts.atop) {
                    child.atop = opts.atop;
                } else {
                    child.top = opts.top;
                }

                if (opts.col === 0 && opts.aleft) {
                    child.aleft = opts.aleft;
                } else {
                    child.left = opts.left;
                }

                child.width = opts.width;
                child.height = opts.height;

                cb(child, opts);
            }

            currentCol += colSpan;

            if (currentCol >= cols) {
                currentCol = 0;
                currentRow++;

                colSpanIndex = -1;
                rowSpanIndex = -1;

                cols = startCols;
                colSpan = 1;
                rowSpan = 1;
            }

            remainder--;
            index++;
        }

        this.screen.render();

        const map = { ...this.normalizeItemMap() };

        if (this.cloneMap) {
            this.itemMap = this.cloneMap;
        }

        return map;
    }

    normalizeItemMap() {
        let map = [];

        for (let p = 0; p < this.itemMap.length; p++) {
            map[p] = [];
            for (let y = 0; y < this.itemMap[p].length; y++) {
                let row = [];

                for (let x = 0; x < this.itemMap[p][y].length; x++) {
                    let key = this.itemMap[p][y][x];
                    if (!!key && key !== '') {
                        if (!row.includes(key)) {
                            row.push(key);
                        }
                    }
                }

                map[p].push(row);
            }
        }

        this.itemMap = [...map];

        return this.itemMap;
    }

    resize() {
        if (!this.parent) {
            return;
        }

        if (this.parent.type === 'panel') {
            this.recalc();

            for (const child of this.children) {
                if (child.resize) {
                    child.resize(true);
                }
            }
        }
        this.screen.render();
    }

    initEvents() {
        if (this.options.nav !== false) {
            if (this.options.nav === 'tab') {
                this.screen.key('tab', () => {
                    if (this.processKeys && !this.screen.promptOpen) {
                        this.focusNext();
                    }
                });
            } else {
                this.screen.key(
                    'C-right',
                    throttle(() => {
                        if (this.processKeys && !this.screen.promptOpen) {
                            this.focusRight();
                        }
                    }, 100)
                );

                this.screen.key(
                    'C-left',
                    throttle(() => {
                        if (this.processKeys && !this.screen.promptOpen) {
                            this.focusLeft();
                        }
                    }, 100)
                );

                this.screen.key(
                    'C-up',
                    throttle(() => {
                        if (this.processKeys && !this.screen.promptOpen) {
                            this.focusUp();
                        }
                    }, 100)
                );

                this.screen.key(
                    'C-down',
                    throttle(() => {
                        if (this.processKeys && !this.screen.promptOpen) {
                            this.focusDown();
                        }
                    }, 100)
                );
            }

            this.screen.key(
                'C-S-right',
                throttle(() => {
                    if (this.processKeys && !this.screen.promptOpen) {
                        let cPage = this.currentPage;
                        cPage++;
                        if (cPage >= this.pages) {
                            cPage = 0;
                        }

                        this.showPage(cPage);
                    }
                }, 250)
            );

            this.screen.key(
                'C-S-left',
                throttle(() => {
                    if (this.processKeys && !this.screen.promptOpen) {
                        let cPage = this.currentPage;
                        cPage--;
                        if (cPage < 0) {
                            cPage = this.pages - 1;
                        }

                        this.showPage(cPage);
                    }
                }, 250)
            );

            this.screen.on('keypress', (ch, key) => {
                if (
                    this.processKeys &&
                    this.pages > 1 &&
                    !this.screen.promptOpen
                ) {
                    if (
                        [
                            'f1',
                            'f2',
                            'f3',
                            'f4',
                            'f5',
                            'f6',
                            'f7',
                            'f8',
                        ].includes(key.full)
                    ) {
                        let num = Number(key.full.replace('f', '')) - 1;

                        if (num < 0) {
                            num = this.pages - 1;
                        } else if (num >= this.pages) {
                            num = 0;
                        }

                        this.showPage(num);
                    }
                }
            });

            this.on('focus', () => {
                if (this.screen.focused !== this.children[this.focusedIndex]) {
                    this.children[this.focusedIndex].focus();
                }
            });

            this.on('resize', this.debouncedResize);
        } else {
            this.on('focus', () => {
                if (this.resizeOnFocus && this.parent) {
                    const parent = this.parent;
                    this.detach();
                    parent.append(this);
                    this.resizeOnFocus = false;
                }
            });

            this.on('resize', this.debouncedResize);

            this.screen.on('keypress', this.onKeypress);
            this.screen.on('mouse', this.onMouse);

            this.on('destroy', () => {
                this.screen.removeListener('keypress', this.onKeypress);
                this.screen.removeListener('mouse', this.onMouse);
            });
        }
    }

    onMouse(data) {
        if (
            !this.hidden &&
            this.screen.focused === this &&
            (this.screen.hover === this ||
                this.isInside(
                    this.screen.program.mouseX,
                    this.screen.program.mouseY
                ))
        ) {
            if (
                ['wheelup', 'wheeldown', 'mouseup', 'mousedown'].includes(
                    data.action
                ) ||
                (data.action === 'mousemove' && data.dragging)
            ) {
                for (const child of this.children) {
                    child.emit(data.action, data);
                }
            }
        }
    }

    onKeypress(ch, key) {
        if (!this.hidden && this.screen.focused === this) {
            if (key.full === 'C-z') {
                this.children.forEach((child) => {
                    child.hide();
                });
                this.setLabel('Closing');
                this.closing = true;
                setTimeout(() => {
                    this.destroy();
                }, 1000);
                return;
            }

            for (const child of this.children) {
                child.emit('keypress', ch, key);
            }
        }
    }

    hideOthers(key) {
        const unhid = this.getItemIndex(key);

        this.showItem(key);

        this.children.forEach((child, index) => {
            if (index !== unhid) {
                child.hide();
                if (child.activeItem) {
                    child.activeItem.hide();
                }
            }
        });
    }

    showPage(page, cb) {
        let change = false;
        if (page !== undefined) {
            if (this.currentPage !== page) {
                change = true;
            }

            this.currentPage = page;
        }

        this.children.forEach((child) => {
            if (child.options.page === this.currentPage) {
                if (!cb || (cb && cb(child))) {
                    if (!child.parent) {
                        this.append(child);
                    }

                    child.show();
                }
            } else {
                child.hide();
            }
        });

        if (change) {
            this.focusItem(this.focusedIndex);
        }

        this.emit('show page', this.currentPage);

        this.screen.render();
    }

    get type() {
        return 'grid';
    }

    getItemIndex(key) {
        if (key === undefined || key === null) {
            key = this.focusedIndex;
        }

        if (typeof key === 'number') {
            return key;
        }

        let gridindex;

        const item = this.getItem(key);

        gridindex = item.options.gridIndex;

        return gridindex;
    }

    getItem(key) {
        if (key === undefined) {
            key = Number(this.focusedIndex);
        }

        let item = null;

        if (typeof key === 'object') {
            item = key;
        } else if (typeof key === 'number') {
            item = this.children[key];
        } else {
            for (const child of this.children) {
                if (child.type === 'listbar') {
                    continue;
                }

                if (child.options.key === key) {
                    item = child;
                    break;
                }

                if (child.itemKey === key) {
                    item = child;
                    break;
                }

                if (child.id === key) {
                    item = child;
                    break;
                }

                if (child.type === key) {
                    item = child;
                    break;
                }

                if (child.uiType === key) {
                    item = child;
                    break;
                }
            }
        }

        return item;
    }

    hideItem(key) {
        this.getItem(key).hide();
    }

    showItem(key) {
        const item = this.getItem(key);

        if (!item.parent) {
            this.append(item);
        }

        item.show();
    }

    focusItem(key, doFocus = true) {
        let index = this.getItemIndex(key);
        const item = this.getItem(index);

        if (index !== this.focusedIndex) {
            this.focusedIndex = index;

            if (doFocus) {
                item.focus();
            }

            this.emit('focus item', this.focusedIndex);
        }
    }

    focusNext() {
        const offset =
            this.currentPage === 0
                ? 0
                : this.currentPage * this.options.perPage;

        let onPage = this.options.items.length - offset;
        if (onPage > this.options.perPage) {
            onPage = this.options.perPage;
        }

        this.focusedIndex = this.focusedIndex + 1;

        if (this.focusedIndex - offset >= onPage) {
            this.focusedIndex = offset;
        }

        this.focusItem(this.focusedIndex);
    }

    focusPrev() {
        const offset =
            this.currentPage === 0
                ? 0
                : this.currentPage * this.options.perPage;

        let onPage = this.options.items.length - offset;
        if (onPage > this.options.perPage) {
            onPage = this.options.perPage;
        }

        this.focusedIndex = this.focusedIndex - 1;

        if (this.focusedIndex - offset < 0) {
            this.focusedIndex = offset + onPage - 1;
        }

        this.focusItem(this.focusedIndex);
    }

    focusUp() {
        const item = this.getFocusedItem();
        const mapKey = this.options.mapKey;
        const coords = this.focusedCoords;

        let upItem;

        let col = coords.col;
        let row = coords.row - 1;

        if (!this.itemMap[this.currentPage][row]) {
            row = this.itemMap[this.currentPage].length - 1;
        }

        if (!this.itemMap[this.currentPage][row][col]) {
            if (
                col >
                Math.floor(this.itemMap[this.currentPage][coords.row].length) /
                    2
            ) {
                col = this.itemMap[this.currentPage][row].lastIndexOf(
                    item[mapKey]
                );
            } else {
                col = this.itemMap[this.currentPage][row].indexOf(item[mapKey]);
            }

            if (!this.itemMap[this.currentPage][row][col]) {
                col = 0;
            }
        }

        upItem = this.itemMap[this.currentPage][row][col];

        if (upItem) {
            this.focusItem(upItem);
        }
    }

    focusDown() {
        const item = this.getFocusedItem();
        const mapKey = this.options.mapKey;

        const coords = this.focusedCoords;

        let downItem;
        let col = coords.col;
        let row = coords.row + 1;

        if (!this.itemMap[this.currentPage][coords.row + 1]) {
            row = 0;
        }

        if (!this.itemMap[this.currentPage][row][col]) {
            if (
                col >
                Math.floor(this.itemMap[this.currentPage][coords.row].length) /
                    2
            ) {
                col = this.itemMap[this.currentPage][row].lastIndexOf(
                    item[mapKey]
                );
            } else {
                col = this.itemMap[this.currentPage][row].indexOf(item[mapKey]);
            }

            if (!this.itemMap[this.currentPage][row][col]) {
                col = this.itemMap[this.currentPage][row].length - 1;
            }
        }

        downItem = this.itemMap[this.currentPage][row][col];

        if (downItem) {
            this.focusItem(downItem);
        }
    }

    focusLeft() {
        const item = this.getFocusedItem();
        const mapKey = this.options.mapKey;
        const coords = this.focusedCoords;

        let row = coords.row;
        let col = coords.col - 1;

        let leftItem = this.itemMap[this.currentPage][row][col];

        if (leftItem && leftItem === item[mapKey]) {
            while (leftItem === item[mapKey]) {
                col -= 1;
                leftItem = this.itemMap[this.currentPage][row][col];
            }
        }

        const prevRowItem =
            this.itemMap[this.currentPage][row - 1] &&
            this.itemMap[this.currentPage][row - 1][
                this.itemMap[this.currentPage][row - 1].length - 1
            ];

        const lastRowItem =
            this.itemMap[this.currentPage][
                this.itemMap[this.currentPage].length - 1
            ][
                this.itemMap[this.currentPage][
                    this.itemMap[this.currentPage].length - 1
                ].length - 1
            ];

        if (leftItem) {
            this.focusItem(leftItem);
            return;
        }

        if (prevRowItem) {
            this.focusItem(prevRowItem);
            return;
        }

        this.focusItem(lastRowItem);
    }

    focusRight() {
        const item = this.getFocusedItem();
        const mapKey = this.options.mapKey;
        const coords = this.focusedCoords;
        let row = coords.row;
        let col = coords.col + 1;

        let rightItem = this.itemMap[this.currentPage][row][col];

        if (rightItem && rightItem === item[mapKey]) {
            while (rightItem === item[mapKey]) {
                col += 1;
                rightItem = this.itemMap[this.currentPage][row][col];
            }
        }

        const nextRowItem =
            this.itemMap[this.currentPage][coords.row + 1] &&
            this.itemMap[this.currentPage][coords.row + 1][0];

        const firstRowItem = this.itemMap[this.currentPage][0][0];

        if (rightItem) {
            this.focusItem(rightItem);
            return;
        }

        if (nextRowItem) {
            this.focusItem(nextRowItem);
            return;
        }

        this.focusItem(firstRowItem);
    }

    getFocusedItem() {
        return this.children[this.focusedIndex];
    }

    debug(text, clear = false, diff = false) {
        if (1 === 1) {
            return;
        }

        if (this.parent !== this.screen && this.parent.debug) {
            this.parent.debug(text, clear, diff);
            return;
        }

        if (!!text && typeof text === 'object') {
            if (text.screen || text.parent || text.stream || text.options) {
                text = omit(text, [
                    'buf',
                    'screen',
                    'parent',
                    'widget',
                    'program',
                    'stream',
                    'options',
                ]);
            }
            text = JSON.stringify(text, null, 4);
        } else if (!!text && typeof text !== 'string') {
            text = String(text);
        }

        if (diff && this.lastText === JSON.stringify(text)) {
            return;
        }

        this.lastText = JSON.stringify(text);

        const d = this.getItem('debug');

        if (d) {
            if (clear && d.clear) {
                d.clear({ firstLine: true });
            }

            if (d.writeln) {
                d.writeln(text);
            }

            if (d.setScrollPerc) {
                d.setScrollPerc(100);
            }
        }
    }
}

module.exports = Grid;
