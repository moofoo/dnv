/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

const NON_WORD_CHARACTERS = ' ~!@#$%^&*()+`-=[]{}|;:"\',./<>?';
const LINES_CACHE_TIME_TO_LIVE = 15 * 1000; // 15 secs

const SelectionService = require('./selection-service');

class SearchAddon {
    constructor(terminal, blessedTerm) {
        this._linesCache;
        this._linesCacheTimeoutId = 0;
        this._cursorMoveListener;
        this._resizeListener;
        this.activate(terminal, blessedTerm);
    }

    get enabled() {
        return this._terminal._core._selectionService._enabled;
    }

    get selectionText() {
        if (this._terminal._core._selectionService._enabled) {
            return this._terminal._core._selectionService.selectionText;
        }

        return '';
    }

    activate(terminal, blessedTerm) {
        this._terminal = terminal;
        this._blessedTerm = blessedTerm;

        this._terminal._mouseService = {
            getCoords: (event) => {
                const { col, row } = this._blessedTerm.blessedToXterm(
                    event.clientY + 1,
                    event.clientX
                );

                return [col, row];
            },
        };

        this._terminal._core._selectionService = new SelectionService(
            this._terminal,
            this._terminal._core._bufferService,
            this._terminal._core._coreService,
            this._terminal._mouseService,
            this._terminal._core.optionsService,
            this._terminal._core._renderService,
            blessedTerm
        );

        this._destroyLinesCache = this._destroyLinesCache.bind(this);
    }

    dispose() {
        if (!this._terminal._core._selectionService.disposed) {
            this._terminal._core._selectionService.dispose();
        }
    }

    enable() {
        if (!this._terminal._core._selectionService._enabled) {
            this._terminal._core._selectionService.enable();
        }
    }

    disable() {
        if (this._terminal._core._selectionService._enabled) {
            this._terminal._core._selectionService.disable();
        }
    }

    selectAll(refresh = true) {
        if (this._terminal._core._selectionService._enabled) {
            this._terminal._core._selectionService.selectAll(refresh);
        }
    }

    selectLines(start, end, refresh = true) {
        if (this._terminal._core._selectionService._enabled) {
            this._terminal._core._selectionService.selectLines(
                start,
                end,
                refresh
            );
        }
    }

    getLineAt(line) {
        if (this._terminal._core._selectionService._enabled) {
            this._terminal._core._selectionService._selectLineAt(line);
            return this._terminal._core._selectionService.selectionText;
        }
    }

    findNext(term, searchOptions) {
        if (!this._terminal) {
            throw new Error('Cannot use addon until it has been loaded');
        }

        if (!term || term.length === 0) {
            this._terminal.clearSelection();
            return false;
        }

        let startCol = 0;
        let startRow = 0;
        let currentSelection;

        if (this._terminal.hasSelection()) {
            const incremental = searchOptions
                ? searchOptions.incremental
                : false;
            // Start from the selection end if there is a selection
            // For incremental search, use existing row
            currentSelection = this._terminal.getSelectionPosition();

            startRow = incremental
                ? currentSelection.startRow
                : currentSelection.endRow;
            startCol = incremental
                ? currentSelection.startColumn
                : currentSelection.endColumn;
        }

        this._initLinesCache();

        const searchPosition = {
            startRow,
            startCol,
        };

        // Search startRow
        let result = this._findInLine(term, searchPosition, searchOptions);

        // Search from startRow + 1 to end
        if (!result) {
            for (
                let y = startRow + 1;
                y < this._terminal.buffer.active.baseY + this._terminal.rows;
                y++
            ) {
                searchPosition.startRow = y;
                searchPosition.startCol = 0;
                // If the current line is wrapped line, increase index of column to ignore the previous scan
                // Otherwise, reset beginning column index to zero with set new unwrapped line index
                result = this._findInLine(term, searchPosition, searchOptions);
                if (result) {
                    break;
                }
            }
        }
        // If we hit the bottom and didn't search from the very top wrap back up
        if (!result && startRow !== 0) {
            for (let y = 0; y < startRow; y++) {
                searchPosition.startRow = y;
                searchPosition.startCol = 0;
                result = this._findInLine(term, searchPosition, searchOptions);
                if (result) {
                    break;
                }
            }
        }

        // If there is only one result, wrap back and return selection if it exists.
        if (!result && currentSelection) {
            searchPosition.startRow = currentSelection.startRow;
            searchPosition.startCol = 0;
            result = this._findInLine(term, searchPosition, searchOptions);
        }

        const doScroll =
            searchOptions && searchOptions.doScroll !== undefined
                ? searchOptions.doScroll
                : true;

        if (!result) {
            this._foundLine = null;
        }

        // Set selection and scroll if a result was found
        return this._selectResult(result, doScroll);
    }

    findPrevious(term, searchOptions) {
        if (!this._terminal) {
            throw new Error('Cannot use addon until it has been loaded');
        }

        if (!term || term.length === 0) {
            this._terminal.clearSelection();
            return false;
        }

        const isReverseSearch = true;
        let startRow = this._terminal.buffer.active.baseY + this._terminal.rows;
        let startCol = this._terminal.cols;
        let result;
        const incremental = searchOptions ? searchOptions.incremental : false;
        let currentSelection;
        if (this._terminal.hasSelection()) {
            currentSelection = this._terminal.getSelectionPosition();
            // Start from selection start if there is a selection
            startRow = currentSelection.startRow;
            startCol = currentSelection.startColumn;
        }

        this._initLinesCache();
        const searchPosition = {
            startRow,
            startCol,
        };

        if (incremental) {
            // Try to expand selection to right first.
            result = this._findInLine(
                term,
                searchPosition,
                searchOptions,
                false
            );
            const isOldResultHighlighted =
                result && result.row === startRow && result.col === startCol;
            if (!isOldResultHighlighted) {
                // If selection was not able to be expanded to the right, then try reverse search
                if (currentSelection) {
                    searchPosition.startRow = currentSelection.endRow;
                    searchPosition.startCol = currentSelection.endColumn;
                }
                result = this._findInLine(
                    term,
                    searchPosition,
                    searchOptions,
                    true
                );
            }
        } else {
            result = this._findInLine(
                term,
                searchPosition,
                searchOptions,
                isReverseSearch
            );
        }

        // Search from startRow - 1 to top
        if (!result) {
            searchPosition.startCol = Math.max(
                searchPosition.startCol,
                this._terminal.cols
            );
            for (let y = startRow - 1; y >= 0; y--) {
                searchPosition.startRow = y;
                result = this._findInLine(
                    term,
                    searchPosition,
                    searchOptions,
                    isReverseSearch
                );
                if (result) {
                    break;
                }
            }
        }
        // If we hit the top and didn't search from the very bottom wrap back down
        if (
            !result &&
            startRow !==
                this._terminal.buffer.active.baseY + this._terminal.rows
        ) {
            for (
                let y =
                    this._terminal.buffer.active.baseY + this._terminal.rows;
                y >= startRow;
                y--
            ) {
                searchPosition.startRow = y;
                result = this._findInLine(
                    term,
                    searchPosition,
                    searchOptions,
                    isReverseSearch
                );
                if (result) {
                    break;
                }
            }
        }

        // If there is only one result, return true.
        if (!result && currentSelection) return true;

        // Set selection and scroll if a result was found
        return this._selectResult(result);
    }

    _initLinesCache() {
        const terminal = this._terminal;
        if (!this._linesCache) {
            this._linesCache = new Array(terminal.buffer.active.length);

            this._cursorMoveListener = terminal.onCursorMove(() =>
                this._destroyLinesCache()
            );

            this._resizeListener = terminal.onResize(() =>
                this._destroyLinesCache()
            );
        }

        clearTimeout(this._linesCacheTimeoutId);
        this._linesCacheTimeoutId = setTimeout(
            () => this._destroyLinesCache(),
            LINES_CACHE_TIME_TO_LIVE
        );
    }

    _destroyLinesCache() {
        this._linesCache = undefined;

        if (this._cursorMoveListener) {
            this._cursorMoveListener.dispose();
            this._cursorMoveListener = undefined;
        }

        if (this._resizeListener) {
            this._resizeListener.dispose();
            this._resizeListener = undefined;
        }
        if (this._linesCacheTimeoutId) {
            clearTimeout(this._linesCacheTimeoutId);
            this._linesCacheTimeoutId = 0;
        }
    }

    _isWholeWord(searchIndex, line, term) {
        return (
            (searchIndex === 0 ||
                NON_WORD_CHARACTERS.indexOf(line[searchIndex - 1]) !== -1) &&
            (searchIndex + term.length === line.length ||
                NON_WORD_CHARACTERS.indexOf(line[searchIndex + term.length]) !==
                    -1)
        );
    }

    _findInLine(
        term,
        searchPosition,
        searchOptions = {},
        isReverseSearch = false
    ) {
        const terminal = this._terminal;
        let row = searchPosition.startRow;
        const col = searchPosition.startCol;

        // Ignore wrapped lines, only consider on unwrapped line (first row of command string).
        const firstLine = terminal.buffer.active.getLine(row);
        if (firstLine && firstLine.isWrapped) {
            if (isReverseSearch) {
                searchPosition.startCol += terminal.cols;
                return;
            }

            // This will iterate until we find the line start.
            // When we find it, we will search using the calculated start column.
            searchPosition.startRow--;
            searchPosition.startCol += terminal.cols;
            return this._findInLine(term, searchPosition, searchOptions);
        }
        let stringLine = this._linesCache ? this._linesCache[row] : void 0;
        if (stringLine === void 0) {
            stringLine = this._translateBufferLineToStringWithWrap(row, true);
            if (this._linesCache) {
                this._linesCache[row] = stringLine;
            }
        }

        this._foundLine = stringLine;

        const searchTerm = searchOptions.caseSensitive
            ? term
            : term.toLowerCase();
        const searchStringLine = searchOptions.caseSensitive
            ? stringLine
            : stringLine.toLowerCase();

        let resultIndex = -1;
        if (searchOptions.regex) {
            const searchRegex = RegExp(searchTerm, 'gi');
            let foundTerm;
            if (isReverseSearch) {
                // This loop will get the resultIndex of the _last_ regex match in the range 0..col
                while (
                    (foundTerm = searchRegex.exec(
                        searchStringLine.slice(0, col)
                    ))
                ) {
                    resultIndex = searchRegex.lastIndex - foundTerm[0].length;
                    term = foundTerm[0];
                    searchRegex.lastIndex -= term.length - 1;
                }
            } else {
                foundTerm = searchRegex.exec(searchStringLine.slice(col));
                if (foundTerm && foundTerm[0].length > 0) {
                    resultIndex =
                        col + (searchRegex.lastIndex - foundTerm[0].length);
                    term = foundTerm[0];
                }
            }
        } else {
            if (isReverseSearch) {
                if (col - searchTerm.length >= 0) {
                    resultIndex = searchStringLine.lastIndexOf(
                        searchTerm,
                        col - searchTerm.length
                    );
                }
            } else {
                resultIndex = searchStringLine.indexOf(searchTerm, col);
            }
        }

        if (resultIndex >= 0) {
            // Adjust the row number and search index if needed since a "line" of text can span multiple rows
            if (resultIndex >= terminal.cols) {
                row += Math.floor(resultIndex / terminal.cols);
                resultIndex = resultIndex % terminal.cols;
            }
            if (
                searchOptions.wholeWord &&
                !this._isWholeWord(resultIndex, searchStringLine, term)
            ) {
                return;
            }

            const line = terminal.buffer.active.getLine(row);

            if (line) {
                for (let i = 0; i < resultIndex; i++) {
                    const cell = line.getCell(i);
                    if (!cell) {
                        break;
                    }
                    // Adjust the searchIndex to normalize emoji into single chars
                    const char = cell.getChars();
                    if (char.length > 1) {
                        resultIndex -= char.length - 1;
                    }
                    // Adjust the searchIndex for empty characters following wide unicode
                    // chars (eg. CJK)
                    const charWidth = cell.getWidth();
                    if (charWidth === 0) {
                        resultIndex++;
                    }
                }
            }
            return {
                term,
                col: resultIndex,
                row,
            };
        }
    }

    _translateBufferLineToStringWithWrap(lineIndex, trimRight) {
        const terminal = this._terminal;
        let lineString = '';
        let lineWrapsToNext;

        do {
            const nextLine = terminal.buffer.active.getLine(lineIndex + 1);
            lineWrapsToNext = nextLine ? nextLine.isWrapped : false;
            const line = terminal.buffer.active.getLine(lineIndex);
            if (!line) {
                break;
            }
            lineString += line
                .translateToString(!lineWrapsToNext && trimRight)
                .substring(0, terminal.cols);
            lineIndex++;
        } while (lineWrapsToNext);

        return lineString;
    }

    _selectResult(result, doScroll = true) {
        const terminal = this._terminal;

        if (!result) {
            terminal.clearSelection();
            return false;
        }
        terminal.select(result.col, result.row, result.term.length);

        if (!doScroll) {
            return true;
        }

        // If it is not in the viewport then we scroll else it just gets selected
        if (
            result.row + 1 >=
                terminal.buffer.active.viewportY + terminal.rows ||
            result.row < terminal.buffer.active.viewportY
        ) {
            let scroll = result.row - terminal.buffer.active.viewportY;
            scroll = scroll - Math.ceil(terminal.rows / 2);
            terminal.scrollLines(scroll);
        }
        return true;
    }
}

module.exports = SearchAddon;
