class TerminalDimensionsScrolling {
    get cols() {
        if (!this.parent) {
            return this.lastCols;
        }

        this.lastCols =
            this.width -
            this.iwidth -
            (this.options.termType === 'program' &&
                this.options.shellType !== 'script'
                ? 0
                : 1);

        return this.lastCols;
    }

    get rows() {
        if (!this.parent) {
            return this.lastRows;
        }

        const isShell =
            this.options.termType === 'shell' ||
            this.options.termType === 'program';

        this.lastRows = this.height - this.iheight + (!isShell ? 1 : 0);

        return this.lastRows;
    }

    get lineCount() {
        let value = 0;

        if (this.term) {
            const buffer = this.term.buffer.active;
            const lines = buffer._buffer.lines;
            value = lines.length;
        }

        return value;
    }

    get dimensions() {
        return this._dimensions();
    }

    _getPos() {
        var pos = this.lpos;

        // assert.ok(pos);

        if (!this.lpos) {
            this.noPos = true;
        } else {
            this.noPos = false;
        }

        if (pos) {
            this.lastPos = pos;
        } else if (this.lastPos) {
            return this.lastPos;
        }

        if (pos && pos.aleft != null) return pos;

        pos.aleft = pos.xi;
        pos.atop = pos.yi;
        pos.aright = this.screen.cols - pos.xl;
        pos.abottom = this.screen.rows - pos.yl;
        pos.width = pos.xl - pos.xi;
        pos.height = pos.yl - pos.yi;

        this.lastPos = pos;

        return pos;
    }

    coords(returnLast = true) {
        this.coordinates = this.coordinates || null;

        if (!this.coordinates || this.refreshCoords) {
            this.coordinates = this._getCoords();
            if (this.coordinates) {
                this.refreshCoords = false;
            }
        }

        this.lastCoords = this.lastCoords || this.coordinates;

        if (!returnLast) {
            return this.coordinates;
        }

        return this.coordinates || this.lastCoords;
    }

    _dimensions() {
        let coordinates = this.coords();

        if (!coordinates) {
            return null;
        }

        const { xi, xl, yi, yl } = coordinates;

        const left = xi + this.ileft;
        const right =
            xl -
            this.iright -
            (this.options.termType === 'program'
                ? this.options.termType === 'markdown'
                    ? 1
                    : 0
                : 1);

        const top = yi + this.itop;
        const bottom = yl - this.ibottom;

        const buffer = this.term.buffer.active;

        const viewportY = buffer.viewportY;
        const baseY = buffer.baseY;

        const height = bottom - top;
        const width = right - left;
        const size = width * height;

        const dim = {
            top,
            left,
            bottom,
            right,
            xi,
            xl,
            yi,
            yl,
            width,
            height,
            size,
            viewportRows: bottom - top,
            lines: this.lineCount,
            viewportY,
            baseY,
            cursorY: top + buffer.cursorY,
            cursorX: left + buffer.cursorX,
        };

        return dim;
    }

    /*
        Conversion from blessed to xterm dimensions and vice versa
    */
    blessedToXterm(blessedRow, blessedCol) {
        let row, col;

        if (typeof blessedRow === 'object') {
            row = blessedRow.row;
            col = blessedRow.col;
        } else {
            row = blessedRow;
            col = blessedCol;
        }

        const { viewportY, top, left } = this.dimensions;

        return {
            row: viewportY + row - top,
            col: col - left,
        };
    }

    xtermToBlessed(xtermRow, xtermCol) {
        let row, col;

        if (typeof xtermRow === 'object') {
            row = xtermRow.row;
            col = xtermRow.col;
        } else {
            row = xtermRow;
            col = xtermCol;
        }

        const { viewportY, top, left } = this.dimensions;

        return {
            row: row + top - viewportY,
            col: col + left,
        };
    }

    getScroll() {
        if (!this.term) {
            return 0;
        }

        return this.term.buffer.active.viewportY;
    }

    getScrollPerc() {
        if (!this.term) {
            return 0;
        }

        return this.term.buffer.active.baseY > 0
            ? (this.term.buffer.active.viewportY /
                this.term.buffer.active.baseY) *
            100
            : 100;
    }

    setScrollPerc(i) {
        if (!this.term || this.startingUp || this.skipData) {
            return;
        }

        this.scrollTo(Math.floor((i / 100) * this.term.buffer.active.baseY));

        this.termRender(null, true);
    }

    setScroll(offset) {
        if (!this.term || this.startingUp || this.skipData) {
            return;
        }
        return this.scrollTo(offset);
    }

    scrollTo(offset) {
        if (!this.term || this.startingUp || this.skipData) {
            return;
        }

        if (!this.resizing) {
            this.scrollAtLines = {};
        }

        this.term.scrollLines(offset - this.term.buffer.active.viewportY);
        this.termRender(null, true);

        this.emit('scroll');
    }

    scrollLines(offset) {
        if (!this.term || this.startingUp || this.skipData) {
            return;
        }
        return this.scroll(offset);
    }

    scroll(offset) {
        if (!this.term || this.startingUp || this.skipData) {
            return;
        }

        if (!this.resizing) {
            this.scrollAtLines = {};
        }

        this.term.scrollLines(offset);

        this.termRender(null, true);

        this.emit('scroll');
    }
}

module.exports = TerminalDimensionsScrolling;
