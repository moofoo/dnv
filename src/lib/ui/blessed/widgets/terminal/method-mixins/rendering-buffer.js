let nullCell = null;
let altCell = null;

class RenderingAndBuffer {
    termRender(all = false, full = false, noFull = false) {
        full = full | this.options.full;

        const refresh = this.refresh;

        if (this.skipData) {
            return;
        }

        if (!this.rendered || this.refreshCoords) {
            this.coords();
            this.screen.render();
        } else if (
            !noFull &&
            (all ||
                refresh ||
                this.mouseSelecting ||
                this.popover ||
                this.searchActive ||
                this.promptOpen ||
                !this.lpos ||
                !this.active ||
                !this.ready ||
                (full && this.panelGrid) ||
                (this.parent && !this.parent.lpos))
        ) {
            this.fullRender();
        } else if (!this.hidden) {
            const ret = this.render(true);

            if (full) {
                this.screen.draw(ret.yi + this.itop, ret.yl - this.ibottom);
            } else {
                this.screen.draw(this.filthyTop, this.filthyBottom);
            }
        }

        this.refresh = false;
    }

    render(termRefresh = false) {
        if (this._label) {
            if (!this.screen.autoPadding) {
                this._label.rtop = this.childBase || 0;
            } else {
                this._label.rtop = (this.childBase || 0) - this.itop;
            }
        }

        let ret = this._render(!this.rendered);
        if (!ret) return;
        if (!this.term) return ret;

        const buffer = this.term.buffer.active;
        const ydisp = buffer.viewportY;

        const xi = ret.xi + this.ileft;

        const xl =
            ret.xl -
            this.iright -
            (this.options.termType === 'program' &&
            this.options.shellType !== 'script'
                ? 0
                : 1);

        const yi = ret.yi + this.itop;

        const yl = ret.yl - this.ibottom;

        const start = Math.max(yi, 0);
        const end = yl;
        const left = Math.max(xi, 0);
        const right = xl;

        let xs1;
        let xs2;
        let ys1;
        let ys2;
        let hasSelection = this.term.hasSelection();

        if (hasSelection && !this.searchActive) {
            this.mouseSelecting = true;
        } else if (!hasSelection) {
            this.mouseSelecting = false;
        }

        if (hasSelection) {
            const selection = this.getSelectionPosition();
            xs1 = selection.startColumn;
            xs2 =
                selection.endColumn -
                (this.options.termType === 'program' ? 0 : 1);
            ys1 = selection.startRow;
            ys2 = selection.endRow;
        }

        const cursor =
            !this.options.hideCursor &&
            this.screen.focused === this &&
            ydisp === buffer.baseY;

        const cursorY = start + buffer.cursorY;

        const i = this._scrollBottom();
        let trackY;

        if (this.alwaysScroll) {
            trackY = this.childBase / (i - (ret.yl - ret.yi));
        } else {
            trackY = (this.childBase + this.childOffset) / (i - 1);
        }

        trackY = ret.yi + (((ret.yl - ret.yi) * trackY) | 0);

        if (trackY >= ret.yl) trackY = ret.yl - 1;

        const terminalBg = this.options.termType === 'process' && this.focused;

        const inactive =
            !this.active &&
            !this.inactiveOk &&
            this.options.shellType === 'script';

        let doFade =
            this.popover || (this.rendered && inactive && !this.startingUp);

        nullCell = nullCell || buffer.getNullCell();
        altCell = altCell || buffer.getNullCell();

        let sline;
        let termY;
        let termX;
        let tline;
        let shellLine = -1;
        let cursorLine = -1;
        let cursorX;
        let dattr;
        let ch;
        let inverse = false;
        let underline = false;
        let scell;
        let diff = false;
        let hasChar = false;

        let dirtyRangeStart = this.screen.lines.length;
        let dirtyRangeEnd = 0;

        let match = [];
        let foundCursor = false;
        let onPrompt = false;
        let x = 0;
        let y = 0;
        let searchParts = [];

        this._onPrompt = false;

        for (y = start; y < end; y++) {
            sline = this.screen.lines[y];

            termY = ydisp + y - yi;

            tline = buffer.getLine(termY);

            if (!sline || !tline) break;

            if (this.rendered && !this.filter & termRefresh) {
                sline.dirty = false;
            }

            cursorX = -1;
            if (cursor && y === cursorY) {
                cursorX = xi + buffer.cursorX;
            }

            if (
                this.searchActive &&
                this.searchString.length &&
                !this.searchRegex
            ) {
                searchParts = this.searchString.split('');
            }

            for (x = left; x < right; x++) {
                if (!sline[x]) {
                    break;
                }

                termX = x - xi;

                tline.getCell(termX, nullCell);

                ch = nullCell.getChars() || ' ';

                if (ch !== ' ') {
                    hasChar = true;
                }

                if (this.shell && !onPrompt && ['$', '>', '#'].includes(ch)) {
                    tline.getCell(termX + 1, altCell);

                    if (
                        nullCell.isFgDefault() &&
                        nullCell.isBgDefault() &&
                        altCell.isFgDefault() &&
                        altCell.isBgDefault() &&
                        (altCell.getChars() || ' ') === ' '
                    ) {
                        shellLine = termY;
                    }
                }

                inverse = false;
                underline = false;

                if (
                    this.shell &&
                    x === cursorX &&
                    !this.options.hideCursor &&
                    !foundCursor &&
                    !(termX === 0 && termY === 0)
                ) {
                    if (
                        !(
                            shellLine === -1 &&
                            (buffer.cursorX === 0 ||
                                buffer.cursorX >= this.cols - 2) &&
                            buffer.cursorY >= this.rows - 1
                        )
                    ) {
                        foundCursor = true;
                        cursorLine = termY;

                        if (shellLine !== -1 && termY >= shellLine) {
                            onPrompt = true;
                            this._foundPrompt = true;
                        }

                        if (
                            !this.options.cursorBlink ||
                            (this.options.cursorBlink && this.blinking)
                        ) {
                            if (
                                this.options.cursorStyle === 'line' ||
                                this.options.cursorStyle === 'bar'
                            ) {
                                ch = '\u2502';
                            } else if (
                                this.options.cursorStyle === 'underline'
                            ) {
                                underline = true;
                            } else if (this.options.cursorStyle === 'block') {
                                inverse = true;
                            }
                        }
                    }
                }

                let isSelection = false;

                if (hasSelection) {
                    if (ys1 <= y && ys2 >= y) {
                        if (ys1 === ys2) {
                            if (xs1 <= x && xs2 >= x) {
                                inverse = true;
                            }
                        } else if (y === ys1 && x >= xs1) {
                            inverse = true;
                        } else if (y === ys2 && x <= xs2) {
                            inverse = true;
                        } else if (y > ys1 && y < ys2) {
                            inverse = true;
                        }

                        if (inverse && x !== cursorX && y !== cursorY) {
                            isSelection = true;
                        }
                    }
                }

                const bgColor = nullCell.getBgColor();
                const fgColor = nullCell.getFgColor();

                let bg = bgColor;
                let fg = fgColor;

                /*
                    This fixes some display issues with gtop. Maybe other things? More testing needed, as always.
                    The gist of it is that sometimes fg and bg are 0 (black), but ch is a character (not empty space),
                    which doesn't really make sense, so we assume the intention was for fg to be the default color.
                */

                if (
                    this.options.termType !== 'process' &&
                    this.options.shellType !== 'repl' &&
                    ch !== ' ' &&
                    fg === 0 &&
                    bg <= 0
                ) {
                    if (doFade) {
                        fg = 7;
                    } else {
                        fg = 15;
                    }
                }

                if (this.shellProgram) {
                } else if (isSelection) {
                    bg = -1;
                } else if (bg === -1 || nullCell.isBgDefault()) {
                    if (terminalBg) {
                        if (doFade) {
                            bg = '#090909';
                        } else {
                            bg = '#0D0D0D';
                        }
                    } else {
                        if (![0, -1].includes(this.style.bg)) {
                            bg = this.style.bg;
                        } else if (
                            !this.focused ||
                            doFade ||
                            this.options.termType === 'process'
                        ) {
                            bg = -1;
                        } else {
                            bg = '#090909';
                        }
                    }

                    if (
                        hasSelection &&
                        !this.mouseSelecting &&
                        y >= ys1 &&
                        y <= ys2 &&
                        (x < xs1 || x > xs2)
                    ) {
                        bg = '#242424';
                    }
                }

                scell = sline[x];

                dattr = this.sattr(
                    {
                        invisible: nullCell.isInvisible(),
                        inverse: inverse || nullCell.isInverse(),
                        bold: nullCell.isBold(),
                        underline: underline || nullCell.isUnderline(),
                        italics: nullCell.isItalic(),
                        darken: doFade ? 0.25 : 0,
                    },
                    isSelection ? -1 : fg,
                    bg
                );

                diff = false;

                if (scell[0] !== dattr) {
                    diff = true;
                    scell[0] = dattr;
                }

                if (scell[1] !== ch) {
                    diff = true;
                    scell[1] = ch;
                }

                this.handleUnicode(nullCell, x, y, scell);

                [diff, searchParts, match, scell] = this.markSearchResults(
                    ch,
                    x,
                    y,
                    xi,
                    ys1,
                    ys2,
                    xs1,
                    xs2,
                    inverse,
                    underline,
                    doFade,
                    searchParts,
                    match,
                    tline,
                    nullCell,
                    isSelection,
                    sline,
                    scell,
                    diff
                );

                if (y === trackY || y === this.lastTrackY) {
                    diff = true;
                }

                if (diff) {
                    sline.dirty = true;
                }
            }
        }

        this.lastTrackY = trackY;

        this.elementTop = start;
        this.elementBottom = end;

        this.filthyTop = dirtyRangeStart;
        this.filthyBottom = dirtyRangeEnd;

        if (this.filthyTop === this.filthyBottom) {
            this.filthyBottom += 1;
        }

        this.filthyTop -= 1;

        this.detectShellType(onPrompt, shellLine, cursorLine, hasChar);

        this.rendered = true;

        return ret;
    }

    getIndicesOf(searchStr, str, caseSensitive = false) {
        var searchStrLen = searchStr.length;
        if (searchStrLen == 0) {
            return [];
        }
        var startIndex = 0,
            index,
            indices = [];
        if (!caseSensitive) {
            str = str.toLowerCase();
            searchStr = searchStr.toLowerCase();
        }
        while ((index = str.indexOf(searchStr, startIndex)) > -1) {
            indices.push([index, index + searchStr.width]);
            startIndex = index + searchStrLen;
        }
        return indices;
    }

    handleUnicode(nullCell, x, y, scell) {
        if (nullCell.isCombined() || nullCell.getWidth() > 1) {
            //Used in patched screen.draw to detect unicode characters (of versions higher than blessed supports)
            //Have to handle the situation when a popup gets drawn over a unicode character to keep the line from going screwy
            if (this.popover) {
                if (this.popoverCoords) {
                    const pc = this.popoverCoords;
                    if (x > pc.xi && x < pc.xl && y > pc.yi - 1 && y < pc.yl) {
                        scell.length = 2;
                    } else {
                        scell[2] = true;
                    }
                } else {
                    scell.length = 2;
                }
            } else {
                scell[2] = true;
            }
        } else {
            scell.length = 2;
        }
    }

    markSearchResults(
        ch,
        x,
        y,
        xi,
        ys1,
        ys2,
        xs1,
        xs2,
        inverse,
        underline,
        doFade,
        searchParts,
        match,
        tline,
        nullCell,
        isSelection,
        sline,
        scell,
        diff
    ) {
        if (
            ch &&
            !inverse &&
            this.searchActive &&
            !this.searchRegex &&
            searchParts
        ) {
            if (
                !!searchParts[0] &&
                (ch === searchParts[0] ||
                    ch.toLocaleLowerCase() ===
                        searchParts[0].toLocaleLowerCase())
            ) {
                searchParts.shift();
                match.push(x);
            } else {
                if (searchParts.length !== this.searchString.length) {
                    if (searchParts.length === 0) {
                        for (const mx of match) {
                            if (
                                y >= ys1 &&
                                y <= ys2 &&
                                mx >= xs1 &&
                                mx <= xs2
                            ) {
                                continue;
                            }

                            tline.getCell(mx - xi, nullCell);

                            ch = nullCell.getChars() || ' ';

                            let bg = '#9c9c9c';
                            let fg = '#171717';

                            if (isSelection) {
                                bg = -1;
                            }

                            const dattr = this.sattr(
                                {
                                    inverse: false,
                                    bold: false,
                                    underline:
                                        underline || nullCell.isUnderline(),
                                    italics: false,
                                    darken: doFade ? 0.15 : 0,
                                },
                                fg,
                                bg
                            );

                            scell = sline[mx];

                            if (scell[0] !== dattr) {
                                diff = true;
                                scell[0] = dattr;
                            }

                            if (scell[1] !== ch) {
                                diff = true;
                                scell[1] = ch;
                            }
                        }
                    }

                    match = [];
                    searchParts = this.searchString.split('');
                }
            }
        }

        return [diff, searchParts, match, scell];
    }

    detectShellType(onPrompt, shellLine, cursorLine, hasChar) {
        const buffer = this.term.buffer.active;
        const ydisp = buffer.viewportY;
        const ybase = buffer.baseY;

        const viewportRelativeCursorY = ybase + buffer.cursorY - ydisp;

        if (
            !this.restarting &&
            !this.userClose &&
            this.shell &&
            this.options.termType !== 'program'
        ) {
            if (this.options.hideCursor) {
                this.commandLineLines = [];
                this._foundPrompt = false;
                this.onCommandLine = false;
                this.shellProgram = true;
            } else if (
                !onPrompt &&
                !this._foundPrompt &&
                ydisp === ybase &&
                buffer.cursorX > 0 &&
                buffer.cursorY >= 1
            ) {
                this.commandLineLines = [];
                this._foundPrompt = false;
                this.onCommandLine = false;
                this.shellProgram = true;
            } else if (
                !onPrompt &&
                buffer.cursorY >= this.rows - 1 &&
                (buffer.cursorX === 0 || buffer.cursorX >= this.cols - 2)
            ) {
                this.commandLineLines = [];
                this._foundPrompt = false;
                this.onCommandLine = false;
                this.shellProgram = true;
            } else if (
                onPrompt ||
                (this._foundPrompt &&
                    ybase > 0 &&
                    viewportRelativeCursorY >= this.rows - 1)
            ) {
                if (shellLine >= 0 && cursorLine >= 0) {
                    this.commandLineLines = [shellLine, cursorLine];
                } else {
                    this.commandLineLines = [];
                }
                this.onCommandLine = true;
                this.shellProgram = false;
                this.options.hideCursor = false;
            } else if (hasChar) {
                this.commandLineLines = [];
                this._foundPrompt = false;
                this.onCommandLine = false;
                this.shellProgram = true;
            }
        }
    }
}

module.exports = RenderingAndBuffer;
