class TerminalResizing {
    initializer() {
        this.preResizing = false;
        this.resizing = false;

        this.screenWidth = this.screen.width;
        this.screenHeight = this.screen.height;

        this.scrollAtLines = {};

        this.bindit(['resize', 'preResize']);
    }

    getLinePart(row, part) {
        if (!this.term || !this.dimensions) {
            return 1;
        }

        const { viewportY } = this.dimensions;

        const buffer = this.term.buffer.active;

        let tline = buffer.getLine(row === undefined ? viewportY : row);

        if (!tline) {
            return '';
        }

        let string = tline.translateToString(true);

        if (string.trim() === '') {
            return '';
        }

        if (part) {
            string = string.trimLeft().replace('\t', '');

            return string.split(' ').slice(0, part).join(' ');
        }

        return string;
    }

    preResize(force = false, skipD = true) {
        if (!this.term) {
            return;
        }

        if (this.ready && (force || (!this.preResizing && !this.resizing))) {
            this.preResizing = true;

            this.preResizingTimeout =
                this.preResizingTimeout ||
                setTimeout(() => {
                    this.preResizingTimeout = null;
                    this.preResizing = false;
                }, 500);

            if (this.ready) {
                this.startLine = this.getLinePart(undefined, 6);

                this.scrollAtLines[this.lineCount] = this.getScroll();

                this.startScrollPerc = this.getScrollPerc();
                this.scrollResizePerc = this.getScroll() / this.lineCount;
            } else {
                this.startScrollPerc = null;
                this.scrollResizePerc = null;
            }

            this.startRows = this.rows;
            this.startCols = this.cols;

            this.screenWidth = this.screen.width;
            this.screenHeight = this.screen.height;

            if (skipD) {
                this.skipData = true;
            }
        }
    }

    resize(force = false) {
        if (this.hidden) {
            process.nextTick(() => {
                this._resize(force);
            });
        } else {
            this._resize(force);
        }
    }

    _resize(force = false) {
        force = force || this.screen.program.resizing;

        if (!this.term || (this.resizing && !force)) {
            return;
        }

        this.clearSelection();

        this.resizing = true;
        this.refreshCoords = true;

        this.startRows = this.startRows || this.lastRows;
        this.startCols = this.startCols || this.lastCols;

        let resizeTermPty = false;

        if (
            force ||
            this.rows != this.startRows ||
            this.cols !== this.startCols ||
            this.screenWidth !== this.screen.width ||
            this.screenHeight !== this.screen.height
        ) {
            resizeTermPty = true;
        }

        this.skipData = false;

        if (resizeTermPty) {
            if (this.resizePty) {
                this.resizePty();
            }
            this.resizeTerm();
        }

        let corrected = false;

        if (
            this.ready &&
            !this.shellProgram &&
            !this.userClose &&
            (force ||
                (resizeTermPty &&
                    this.lineCount > this.rows &&
                    this.lineCount !== this.startLineCount))
        ) {
            if (this.options.termType === 'shell') {
                this.setScrollPerc(100);
            } else {
                corrected = this.correctScroll();
            }
        }

        if (!corrected) {
            this.termRender(null, true);
        }

        this.resizingTimeout =
            this.resizingTimeout ||
            setTimeout(() => {
                this.resizingTimeout = null;
                this.preResizing = false;
                this.resizing = false;

                this.wheelAmount = 1;

                try {
                    if (this.maximized && !this.panelGrid) {
                        this.wheelAmount = 2;
                    }
                } catch {}

                if (!this.hidden) {
                    this.resizeOnFocus = false;
                }
            }, 100);

        return true;
    }

    correctScroll() {
        let top = false;
        let bottom = false;

        if (this.rows > this.startRows && this.startScrollPerc === 100) {
            bottom = true;
        } else if (this.startScrollPerc === 0) {
            top = true;
        }

        if (!isNaN(this.scrollAtLines[this.lineCount])) {
            this.scrollTo(this.scrollAtLines[this.lineCount]);
            return true;
        } else if (top) {
            this.setScrollPerc(0);
            return true;
        } else if (bottom) {
            this.setScrollPerc(100);
            return true;
        } else if (this.scrollResizePerc) {
            let scrollTo = Math.ceil(this.lineCount * this.scrollResizePerc);

            if (this.getLinePart(scrollTo, 6) !== this.startLine) {
                let mod;
                let found = false;

                for (let x = 1; x <= 5; x++) {
                    mod = x * -1;

                    if (
                        scrollTo + mod >= 0 &&
                        this.getLinePart(scrollTo + mod, 6) === this.startLine
                    ) {
                        found = true;
                        break;
                    }

                    mod = x;

                    if (
                        scrollTo + mod <= this.lineCount &&
                        this.getLinePart(scrollTo + mod, 6) === this.startLine
                    ) {
                        found = true;
                        break;
                    }
                }

                if (found) {
                    scrollTo += mod;
                }
            }
            if (scrollTo >= 0 && scrollTo <= this.lineCount) {
                this.scrollTo(scrollTo);
            } else {
                this.setScrollPerc(100);
            }

            return true;
        }

        return false;
    }

    resizeTerm() {
        if ((this.filter && this.filter !== '') || this.stayFiltered) {
            this._filterTerm.resize(this.cols, this.rows);
        } else {
            this._term.resize(this.cols, this.rows);
        }
    }
}

module.exports = TerminalResizing;
