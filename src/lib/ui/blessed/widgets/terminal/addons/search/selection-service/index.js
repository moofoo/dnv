/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

/*
    This is a re-write of the XTerm SelectionService class for use in a terminal environment, with
    mouse events coming from Blessed.

    The Blessed->XTerm translation is managed by the _screenElement.ownerDocument object (which would be Document in a
    browser environment). Mainly this involves changing the property names for button and coordinates
    of Blessed events to make them mirror DOM events, enough so SelectionService will work with them, as well as
    doing some DNV UI specific logic. See ./owner-document.js

    Translation of terminal mouse coordinates to XTerm coordinates is handled by terminal._mouseService.getCoords, which
    had to be created manually (that's a browser-specific XTerm service, of course). See SearchAddon -> activate method, in
    ../index.js (relative to this file).

    There are a number of tweaks and changes, due to a variety of factors:

    - Coordinates are rows/cols, rather than pixels, among other Terminal vs Browser environment differences (the big one obviously
      being that writing ANSI codes to output stream != input events in a queue)

    - Added some flags to make absolutely sure methods running on intervals/events don't execute
      when they aren't supposed to (Blessed buffers writes to the output stream, flushing on tick, which makes things a little wonky,
      since input event emission and UI updates aren't synchronous)

    - Unreliable nature of terminal mouse events, at least as presently implemented. For example:

        - there are 'dead' cells where X/Y coords are undefined, seemingly randomly distributed (I can't make heads or tails of this,
          need to triple-check to make sure it's not something I've caused. I've implemented a rough fix which guesses
          what the coordinates probably are by diffing the coords of current and previous mouse events.
          See _bindMouse in src/lib/ui/blesesd/patched/program.js)

        - Unusually large jumps in mouse coordinates (while dragging) are ignored.
*/

const SelectionModel = require('./model');
const { Disposable } = require('./disposable');
const { EventEmitter } = require('./emitter');
const os = require('os');
const CellData = require('../../../util/celldata');
const OwnerDocument = require('./owner-document');
const { moveToCellSequence } = require('./moveToCell');

/**
 * The number of pixels the mouse needs to be above or below the viewport in
 * order to scroll at the maximum speed.
 */
const DRAG_SCROLL_MAX_THRESHOLD = 50;

/**
 * The maximum scrolling speed
 */
const DRAG_SCROLL_MAX_SPEED = 5;

/**
 * The number of milliseconds between drag scroll updates.
 */
const DRAG_SCROLL_INTERVAL = 15;

/**
 * The maximum amount of time that can have elapsed for an alt click to move the
 * cursor.
 */
const ALT_CLICK_MOVE_CURSOR_TIME = 500;

const NON_BREAKING_SPACE_CHAR = String.fromCharCode(160);
const ALL_NON_BREAKING_SPACE_REGEX = new RegExp(NON_BREAKING_SPACE_CHAR, 'g');

/**
 * A selection mode, this drives how the selection behaves on mouse move.
 */
const SelectionMode = {
    NORMAL: 0,
    WORD: 1,
    LINE: 2,
    COLUMN: 3,
};

/**
 * A class that manages the selection of the terminal. With help from
 * SelectionModel, SelectionService handles with all logic associated with
 * dealing with the selection, including handling mouse interaction, wide
 * characters and fetching the actual text within the selection. Rendering is
 * not handled by the SelectionService but the onRedrawRequest event is fired
 * when the selection is ready to be redrawn (on an animation frame).
 */
class SelectionService extends Disposable {
    _workCell = new CellData();

    get onRequestRedraw() {
        return this._onRedrawRequest.event;
    }

    get onSelectionChange() {
        return this._onSelectionChange.event;
    }

    get onRequestScrollLines() {
        return this._onRequestScrollLines.event;
    }

    constructor(
        _terminal,
        _bufferService,
        _coreService,
        _mouseService,
        _optionsService,
        _renderService,
        _blessedTerm
    ) {
        super();

        this._screenElement = {
            ownerDocument: new OwnerDocument(_blessedTerm, this),
        };

        this.serviceBrand;
        this._model;
        this._dragScrollAmount = 0;
        this._activeSelectionMode;
        this._dragScrollIntervalTimer;
        this._refreshAnimationFrame;
        this._enabled = true;
        this._trimListener;
        this._mouseDownTimeStamp = 0;
        this._oldHasSelection = false;
        this._oldSelectionStart = undefined;
        this._oldSelectionEnd = undefined;
        this._onRedrawRequest = this.register(new EventEmitter());
        this._onSelectionChange = this.register(new EventEmitter());
        this._onRequestScrollLines = this.register(new EventEmitter());

        this._terminal = _terminal;
        this._bufferService = _bufferService;
        this._coreService = _coreService;
        this._mouseService = _mouseService;
        this._optionsService = _optionsService;
        this._renderService = _renderService;

        this._dragScroll = this._dragScroll.bind(this);
        this._dragScrollReval = this._dragScrollReval.bind(this);

        this.revalInterval = null;
        this.dragInterval = null;
        this.mouseDown = false;
        this.lastEvent = null;
        this.eventsAdded = false;
        this.disposed = false;

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);

        this._screenElement.ownerDocument.addEventListener(
            'mousedown',
            this.onMouseDown,
            true
        );

        this._coreService.onUserInput(() => {
            if (this.hasSelection) {
                this.clearSelection();
            }
        });
        this._trimListener = this._bufferService.buffer.lines.onTrim((amount) =>
            this._onTrim(amount)
        );
        this.register(
            this._bufferService.buffers.onBufferActivate((e) =>
                this._onBufferActivate(e)
            )
        );

        this.enable();

        this._model = new SelectionModel(this._bufferService);
        this._activeSelectionMode = SelectionMode.NORMAL;
    }

    dispose() {
        this._screenElement.ownerDocument.removeEventListener(
            'mousedown',
            this.onMouseDown
        );

        this._removeMouseDownListeners();

        this._screenElement.ownerDocument.removeEvents();

        this._enabled = false;
        this.disposed = true;
    }

    reset() {
        this.clearSelection();
        this.actualSelectionText = '';
        this.actualStart = null;
        this.actualEnd = null;
    }

    /**
     * Disables the selection manager. This is useful for when terminal mouse
     * are enabled.
     */
    disable() {
        this.clearSelection();
        this._removeMouseDownListeners();
        this._enabled = false;
    }

    /**
     * Enable the selection manager.
     */
    enable() {
        this._enabled = true;
        this._model = new SelectionModel(this._bufferService);
    }

    get selectionStart() {
        return this._model.finalSelectionStart;
    }
    get selectionEnd() {
        return this._model.finalSelectionEnd;
    }

    /**
     * Gets whether there is an active text selection.
     */
    get hasSelection() {
        const start = this._model.finalSelectionStart;
        const end = this._model.finalSelectionEnd;
        if (!start || !end) {
            return false;
        }
        return start[0] !== end[0] || start[1] !== end[1];
    }

    /**
     * Gets the text currently selected.
     */
    get selectionText() {
        const start = this._model.finalSelectionStart;
        const end = this._model.finalSelectionEnd;

        if (!start || !end) {
            return '';
        }

        end[0]++;

        const buffer = this._bufferService.buffer;
        const result = [];

        if (1 === 2 && this._activeSelectionMode === SelectionMode.COLUMN) {
            // Ignore zero width selections
            if (start[0] === end[0]) {
                return '';
            }

            for (let i = start[1]; i <= end[1]; i++) {
                const lineText = buffer.translateBufferLineToString(
                    i,
                    true,
                    start[0],
                    end[0]
                );
                result.push(lineText);
            }
        } else {
            // Get first row
            const startRowEndCol = start[1] === end[1] ? end[0] : undefined;
            result.push(
                buffer.translateBufferLineToString(
                    start[1],
                    true,
                    start[0],
                    startRowEndCol
                )
            );

            // Get middle rows
            for (let i = start[1] + 1; i <= end[1] - 1; i++) {
                const bufferLine = buffer.lines.get(i);
                const lineText = buffer.translateBufferLineToString(i, true);
                if (bufferLine && bufferLine.isWrapped) {
                    result[result.length - 1] += lineText;
                } else {
                    result.push(lineText);
                }
            }

            // Get final row
            if (start[1] !== end[1]) {
                const bufferLine = buffer.lines.get(end[1]);
                const lineText = buffer.translateBufferLineToString(
                    end[1],
                    true,
                    0,
                    end[0]
                );
                if (bufferLine && bufferLine.isWrapped) {
                    result[result.length - 1] += lineText;
                } else {
                    result.push(lineText);
                }
            }
        }

        // Format string by replacing non-breaking space chars with regular spaces
        // and joining the array into a multi-line string.
        const formattedResult = result
            .map((line) => {
                return line.replace(ALL_NON_BREAKING_SPACE_REGEX, ' ');
            })
            .join(os.platform() === 'win32' ? '\r\n' : '\n');

        return formattedResult;
    }

    /**
     * Clears the current terminal selection.
     */
    clearSelection() {
        this.lastEvent = null;
        this._model.clearSelection();
        this._removeMouseDownListeners();
        this.refresh();
        this._onSelectionChange.fire();
    }

    refresh() {
        this._screenElement.ownerDocument.render();
    }

    _isClickInSelection(event) {
        const coords = this._getMouseBufferCoords(event);
        const start = this._model.finalSelectionStart;
        const end = this._model.finalSelectionEnd;

        if (!start || !end || !coords) {
            return false;
        }

        return this._areCoordsInSelection(coords, start, end);
    }

    _areCoordsInSelection(coords, start, end) {
        return (
            (coords[1] > start[1] && coords[1] < end[1]) ||
            (start[1] === end[1] &&
                coords[1] === start[1] &&
                coords[0] >= start[0] &&
                coords[0] < end[0]) ||
            (start[1] < end[1] && coords[1] === end[1] && coords[0] < end[0]) ||
            (start[1] < end[1] &&
                coords[1] === start[1] &&
                coords[0] >= start[0])
        );
    }

    _selectWordAtCursor(event) {
        const coords = this._getMouseBufferCoords(event);

        if (coords) {
            this._selectWordAt(coords, false);
            this._model.selectionEnd = undefined;
            this.refresh();
        }
    }

    /**
     * Selects all text within the terminal.
     */
    selectAll(refresh = true) {
        this._model.isSelectAllActive = true;
        if (refresh) {
            this.refresh();
        }
        this._onSelectionChange.fire();
    }

    selectLines(start, end, refresh = true) {
        this._model.clearSelection();
        start = Math.max(start, 0);
        end = Math.min(end, this._bufferService.buffer.lines.length - 1);
        this._model.selectionStart = [0, start];
        this._model.selectionEnd = [this._bufferService.cols, end];
        if (refresh) {
            this.refresh();
        }
        this._onSelectionChange.fire();
    }

    _onTrim(amount) {
        const needsRefresh = this._model.onTrim(amount);
        if (needsRefresh) {
            this.refresh();
        }
    }

    _getMouseBufferCoords(event) {
        const coords = this._mouseService.getCoords(event);

        if (!coords) {
            return undefined;
        }

        coords[1]--;

        return coords;
    }

    shouldForceSelection(event) {
        return event.ctrlKey;
    }

    onMouseDown(event) {
        this._mouseDownTimeStamp = event.timeStamp;
        // If we have selection, we want the context menu on right click even if the
        // terminal is in mouse mode.
        if (event.button === 2 && this.hasSelection) {
            return;
        }

        // Only action the primary button
        if (event.button !== 0) {
            return;
        }

        // Allow selection when using a specific modifier key, even when disabled
        if (!this._enabled || this.mouseDown) {
            return;
        }

        // Reset drag scroll state
        this._dragScrollAmount = 0;

        if (event.ctrlKey) {
            this._onIncrementalClick(event);
        } else {
            if (event.detail === 1) {
                this._onSingleClick(event);
            } else if (event.detail === 2) {
                this._onDoubleClick(event);
            } else if (event.detail === 3) {
                this._onTripleClick(event);
            }

            this._addMouseDownListeners(event);
        }

        this.refresh();
    }

    /**
     * Adds listeners when mousedown is triggered.
     */
    _addMouseDownListeners(event) {
        // Listen on the document so that dragging outside of viewport works
        if (
            this._screenElement.ownerDocument &&
            event.inside &&
            !this.eventsAdded
        ) {
            this.mouseDown = true;

            this.lastEvent = null;

            this.eventsAdded = true;

            this._screenElement.ownerDocument.addEventListener(
                'mousemove',
                this._onMouseMove
            );
            this._screenElement.ownerDocument.addEventListener(
                'mouseup',
                this._onMouseUp
            );

            this.termScroll = this._screenElement.ownerDocument.getScroll();

            clearInterval(this.revalInterval);
            clearInterval(this.dragInterval);

            this.revalInterval = setInterval(() => {
                this._dragScrollReval();
            }, 10);

            this.dragInterval = setInterval(() => {
                this._dragScroll();
            }, 100);
        }
    }

    /**
     * Removes the listeners that are registered when mousedown is triggered.
     */
    _removeMouseDownListeners() {
        if (this._screenElement.ownerDocument) {
            this.lastEvent = null;

            this.eventsAdded = false;

            this._screenElement.ownerDocument.removeEventListener(
                'mousemove',
                this._onMouseMove
            );
            this._screenElement.ownerDocument.removeEventListener(
                'mouseup',
                this._onMouseUp
            );

            clearInterval(this.revalInterval);
            this.revalInterval = null;

            clearInterval(this.dragInterval);
            this.dragInterval = null;
        }
    }

    _onIncrementalClick(event) {
        if (this.hasSelection) {
            this._model.selectionEnd = this._getMouseBufferCoords(event);
        }
    }

    _onSingleClick(event) {
        this._model.selectionStartLength = 0;
        this._model.isSelectAllActive = false;
        this._activeSelectionMode = this.shouldColumnSelect(event)
            ? SelectionMode.COLUMN
            : SelectionMode.NORMAL;

        // Initialize the new selection
        this._model.selectionStart = this._getMouseBufferCoords(event);

        if (!this._model.selectionStart) {
            return;
        }
        this._model.selectionEnd = undefined;

        // Ensure the line exists
        const line = this._bufferService.buffer.lines.get(
            this._model.selectionStart[1]
        );

        if (!line) {
            return;
        }

        // Return early if the click event is not in the buffer (eg. in scroll bar)
        if (line.length === this._model.selectionStart[0]) {
            return;
        }

        // If the mouse is over the second half of a wide character, adjust the
        // selection to cover the whole character
        if (line.hasWidth(this._model.selectionStart[0]) === 0) {
            this._model.selectionStart[0]++;
        }
    }

    _onDoubleClick(event) {
        if (event.inside && !event.altKey) {
            const coords = this._getMouseBufferCoords(event);
            if (coords) {
                this._activeSelectionMode = SelectionMode.WORD;
                this._selectWordAt(coords, true);
            }
        }
    }

    _onTripleClick(event) {
        if (event.inside && !event.altKey) {
            const coords = this._getMouseBufferCoords(event);
            if (coords) {
                this._activeSelectionMode = SelectionMode.LINE;
                this._selectLineAt(coords[1]);
            }
        }
    }

    shouldColumnSelect(event) {
        return true;
    }

    _onMouseMove(event) {
        if (
            this.mouseDown === false ||
            !this._model.selectionStart ||
            event.altKey
        ) {
            return;
        }

        if (this.lastEvent) {
            if (
                event.clientY > this.lastEvent.clientY &&
                event.clientY - this.lastEvent.clientY >= 5
            ) {
                this.refresh();
                return;
            }
        }

        this.lastEvent = { ...event };

        // Record the previous position so we know whether to redraw the selection
        // at the end.
        const previousSelectionEnd = this._model.selectionEnd
            ? [this._model.selectionEnd[0], this._model.selectionEnd[1]]
            : null;

        // Set the initial selection end based on the mouse coordinates
        this._model.selectionEnd = this._getMouseBufferCoords(event);

        if (!this._model.selectionEnd) {
            this.refresh();
            return;
        }

        // Select the entire line if line select mode is active.
        if (this._activeSelectionMode === SelectionMode.LINE) {
            if (this._model.selectionEnd[1] < this._model.selectionStart[1]) {
                this._model.selectionEnd[0] = 0;
            } else {
                this._model.selectionEnd[0] = this._bufferService.cols;
            }
        } else if (this._activeSelectionMode === SelectionMode.WORD) {
            this._selectToWordAt(this._model.selectionEnd);
        }

        // Determine the amount of scrolling that will happen.
        this._dragScrollAmount = event.offset;

        // If the cursor was above or below the viewport, make sure it's at the
        // start or end of the viewport respectively. This should only happen when
        // NOT in column select mode.
        if (this._activeSelectionMode !== SelectionMode.COLUMN) {
            if (this._dragScrollAmount > 0) {
                this._model.selectionEnd[0] = this._bufferService.cols;
            } else if (this._dragScrollAmount < 0) {
                this._model.selectionEnd[0] = 0;
            }
        }

        // If the character is a wide character include the cell to the right in the
        // selection. Note that selections at the very end of the line will never
        // have a character.
        const buffer = this._bufferService.buffer;
        if (this._model.selectionEnd[1] < buffer.lines.length) {
            const line = buffer.lines.get(this._model.selectionEnd[1]);
            if (line && line.hasWidth(this._model.selectionEnd[0]) === 0) {
                this._model.selectionEnd[0]++;
            }
        }

        // Only draw here if the selection changes.
        if (
            !previousSelectionEnd ||
            previousSelectionEnd[0] !== this._model.selectionEnd[0] ||
            previousSelectionEnd[1] !== this._model.selectionEnd[1]
        ) {
            this.refresh();
        }
    }

    _dragScrollReval() {
        if (
            !this._model.selectionEnd ||
            !this._model.selectionStart ||
            this.revalInterval === null ||
            this.mouseDown === false
        ) {
            return;
        }

        const scroll = this._screenElement.ownerDocument.getScroll();

        if (this._dragScrollAmount && scroll !== this.termScroll) {
            this.termScroll = scroll;
            const buffer = this._bufferService.buffer;
            if (this._dragScrollAmount > 0) {
                if (this._activeSelectionMode !== SelectionMode.COLUMN) {
                    this._model.selectionEnd[0] = this._bufferService.cols;
                }
                this._model.selectionEnd[1] = Math.min(
                    buffer.ydisp + this._bufferService.rows,
                    buffer.lines.length - 1
                );
            } else {
                if (this._activeSelectionMode !== SelectionMode.COLUMN) {
                    this._model.selectionEnd[0] = 0;
                }
                this._model.selectionEnd[1] = buffer.ydisp;
            }

            this.refresh();
        }
    }

    _dragScroll() {
        if (
            !this._model.selectionEnd ||
            !this._model.selectionStart ||
            this.dragInterval === null ||
            this.mouseDown === false
        ) {
            return;
        }

        if (this._dragScrollAmount) {
            this._screenElement.ownerDocument.scroll(this._dragScrollAmount);
        }
    }

    _onMouseUp(event) {
        const timeElapsed = event.timeStamp - this._mouseDownTimeStamp;

        this._removeMouseDownListeners();

        if (!this.mouseDown) {
            return;
        }

        this.mouseDown = false;

        if (
            this._screenElement.ownerDocument.doAltClick &&
            this.selectionText.length <= 1 &&
            timeElapsed < ALT_CLICK_MOVE_CURSOR_TIME &&
            event.altKey
        ) {
            if (
                this._bufferService.buffer.ybase ===
                this._bufferService.buffer.ydisp
            ) {
                const coordinates = this._mouseService.getCoords(event);

                if (
                    coordinates &&
                    coordinates[0] !== undefined &&
                    coordinates[1] !== undefined
                ) {
                    const sequence = moveToCellSequence(
                        coordinates[0],
                        coordinates[1] - 1 - this._bufferService.buffer.ydisp,
                        this._bufferService,
                        this._coreService.decPrivateModes.applicationCursorKeys,
                        this._screenElement.ownerDocument.shellProgram
                            ? false
                            : this._screenElement.ownerDocument.onCommandLine,
                        this._screenElement.ownerDocument.debug
                    );

                    this._screenElement.ownerDocument.onAltClick(sequence);
                }
            }
        } else {
            this._fireEventIfSelectionChanged();
        }

        this.refresh();
    }

    _fireEventIfSelectionChanged() {
        const start = this._model.finalSelectionStart;
        const end = this._model.finalSelectionEnd;
        const hasSelection =
            !!start && !!end && (start[0] !== end[0] || start[1] !== end[1]);

        if (!hasSelection) {
            if (this._oldHasSelection) {
                this._fireOnSelectionChange(start, end, hasSelection);
            }
            return;
        }

        // Sanity check, these should not be undefined as there is a selection
        if (!start || !end) {
            return;
        }

        if (
            !this._oldSelectionStart ||
            !this._oldSelectionEnd ||
            start[0] !== this._oldSelectionStart[0] ||
            start[1] !== this._oldSelectionStart[1] ||
            end[0] !== this._oldSelectionEnd[0] ||
            end[1] !== this._oldSelectionEnd[1]
        ) {
            this._fireOnSelectionChange(start, end, hasSelection);
        }
    }

    _fireOnSelectionChange(start, end, hasSelection) {
        this._oldSelectionStart = start;
        this._oldSelectionEnd = end;
        this._oldHasSelection = hasSelection;
        this._onSelectionChange.fire();
    }

    _onBufferActivate(e) {
        this.clearSelection();
        // Only adjust the selection on trim, shiftElements is rarely used (only in
        // reverseIndex) and delete in a splice is only ever used when the same
        // number of elements was just added. Given this is could actually be
        // beneficial to leave the selection as is for these cases.
        this._trimListener.dispose();
        this._trimListener = e.activeBuffer.lines.onTrim((amount) =>
            this._onTrim(amount)
        );
    }

    _convertViewportColToCharacterIndex(bufferLine, coords) {
        let charIndex = coords[0];
        for (let i = 0; coords[0] >= i; i++) {
            const length = bufferLine
                .loadCell(i, this._workCell)
                .getChars().length;
            if (this._workCell.getWidth() === 0) {
                // Wide characters aren't included in the line string so decrement the
                // index so the index is back on the wide character.
                charIndex--;
            } else if (length > 1 && coords[0] !== i) {
                // Emojis take up multiple characters, so adjust accordingly. For these
                // we don't want ot include the character at the column as we're
                // returning the start index in the string, not the end index.
                charIndex += length - 1;
            }
        }
        return charIndex;
    }

    setSelection(col, row, length) {
        this._model.clearSelection();
        this._removeMouseDownListeners();
        this._model.selectionStart = [col, row];
        this._model.selectionStartLength = length;

        this.refresh();
    }

    rightClickSelect(ev) {
        if (!this._isClickInSelection(ev)) {
            this._selectWordAtCursor(ev);
            this._fireEventIfSelectionChanged();
        }
    }

    _getWordAt(
        coords,
        allowWhitespaceOnlySelection,
        followWrappedLinesAbove = true,
        followWrappedLinesBelow = true
    ) {
        // Ensure coords are within viewport (eg. not within scroll bar)
        if (coords[0] >= this._bufferService.cols) {
            return undefined;
        }

        const buffer = this._bufferService.buffer;
        const bufferLine = buffer.lines.get(coords[1]);
        if (!bufferLine) {
            return undefined;
        }

        const line = buffer.translateBufferLineToString(coords[1], false);

        // Get actual index, taking into consideration wide characters
        let startIndex = this._convertViewportColToCharacterIndex(
            bufferLine,
            coords
        );

        let endIndex = startIndex;

        // Record offset to be used later
        const charOffset = coords[0] - startIndex;
        let leftWideCharCount = 0;
        let rightWideCharCount = 0;
        let leftLongCharOffset = 0;
        let rightLongCharOffset = 0;

        if (line.charAt(startIndex) === ' ') {
            // Expand until non-whitespace is hit
            while (startIndex > 0 && line.charAt(startIndex - 1) === ' ') {
                startIndex--;
            }
            while (
                endIndex < line.length &&
                line.charAt(endIndex + 1) === ' '
            ) {
                endIndex++;
            }
        } else {
            // Expand until whitespace is hit. This algorithm works by scanning left
            // and right from the starting position, keeping both the index format
            // (line) and the column format (bufferLine) in sync. When a wide
            // character is hit, it is recorded and the column index is adjusted.
            let startCol = coords[0];
            let endCol = coords[0];

            // Consider the initial position, skip it and increment the wide char
            // variable
            if (bufferLine.getWidth(startCol) === 0) {
                leftWideCharCount++;
                startCol--;
            }
            if (bufferLine.getWidth(endCol) === 2) {
                rightWideCharCount++;
                endCol++;
            }

            // Adjust the end index for characters whose length are > 1 (emojis)
            const length = bufferLine.getString(endCol).length;
            if (length > 1) {
                rightLongCharOffset += length - 1;
                endIndex += length - 1;
            }

            // Expand the string in both directions until a space is hit
            while (
                startCol > 0 &&
                startIndex > 0 &&
                !this._isCharWordSeparator(
                    bufferLine.loadCell(startCol - 1, this._workCell)
                )
            ) {
                bufferLine.loadCell(startCol - 1, this._workCell);
                const length = this._workCell.getChars().length;
                if (this._workCell.getWidth() === 0) {
                    // If the next character is a wide char, record it and skip the column
                    leftWideCharCount++;
                    startCol--;
                } else if (length > 1) {
                    // If the next character's string is longer than 1 char (eg. emoji),
                    // adjust the index
                    leftLongCharOffset += length - 1;
                    startIndex -= length - 1;
                }
                startIndex--;
                startCol--;
            }
            while (
                endCol < bufferLine.length &&
                endIndex + 1 < line.length &&
                !this._isCharWordSeparator(
                    bufferLine.loadCell(endCol + 1, this._workCell)
                )
            ) {
                bufferLine.loadCell(endCol + 1, this._workCell);
                const length = this._workCell.getChars().length;
                if (this._workCell.getWidth() === 2) {
                    // If the next character is a wide char, record it and skip the column
                    rightWideCharCount++;
                    endCol++;
                } else if (length > 1) {
                    // If the next character's string is longer than 1 char (eg. emoji),
                    // adjust the index
                    rightLongCharOffset += length - 1;
                    endIndex += length - 1;
                }
                endIndex++;
                endCol++;
            }
        }

        // Incremenet the end index so it is at the start of the next character
        endIndex++;

        // Calculate the start _column_, converting the the string indexes back to
        // column coordinates.
        let start =
            startIndex + // The index of the selection's start char in the line string
            charOffset - // The difference between the initial char's column and index
            leftWideCharCount + // The number of wide chars left of the initial char
            leftLongCharOffset; // The number of additional chars left of the initial char added by columns with strings longer than 1 (emojis)

        // Calculate the length in _columns_, converting the the string indexes back
        // to column coordinates.
        let length = Math.min(
            this._bufferService.cols, // Disallow lengths larger than the terminal cols
            endIndex - // The index of the selection's end char in the line string
                startIndex + // The index of the selection's start char in the line string
                leftWideCharCount + // The number of wide chars left of the initial char
                rightWideCharCount - // The number of wide chars right of the initial char (inclusive)
                leftLongCharOffset - // The number of additional chars left of the initial char added by columns with strings longer than 1 (emojis)
                rightLongCharOffset
        ); // The number of additional chars right of the initial char (inclusive) added by columns with strings longer than 1 (emojis)

        if (
            !allowWhitespaceOnlySelection &&
            line.slice(startIndex, endIndex).trim() === ''
        ) {
            return undefined;
        }

        // Recurse upwards if the line is wrapped and the word wraps to the above line
        if (followWrappedLinesAbove) {
            if (start === 0 && bufferLine.getCodePoint(0) !== 32 /* ' ' */) {
                const previousBufferLine = buffer.lines.get(coords[1] - 1);
                if (
                    previousBufferLine &&
                    bufferLine.isWrapped &&
                    previousBufferLine.getCodePoint(
                        this._bufferService.cols - 1
                    ) !== 32 /* ' ' */
                ) {
                    const previousLineWordPosition = this._getWordAt(
                        [this._bufferService.cols - 1, coords[1] - 1],
                        false,
                        true,
                        false
                    );
                    if (previousLineWordPosition) {
                        const offset =
                            this._bufferService.cols -
                            previousLineWordPosition.start;
                        start -= offset;
                        length += offset;
                    }
                }
            }
        }

        // Recurse downwards if the line is wrapped and the word wraps to the next line
        if (followWrappedLinesBelow) {
            if (
                start + length === this._bufferService.cols &&
                bufferLine.getCodePoint(this._bufferService.cols - 1) !==
                    32 /* ' ' */
            ) {
                const nextBufferLine = buffer.lines.get(coords[1] + 1);
                if (
                    nextBufferLine &&
                    nextBufferLine.isWrapped &&
                    nextBufferLine.getCodePoint(0) !== 32 /* ' ' */
                ) {
                    const nextLineWordPosition = this._getWordAt(
                        [0, coords[1] + 1],
                        false,
                        false,
                        true
                    );
                    if (nextLineWordPosition) {
                        length += nextLineWordPosition.length;
                    }
                }
            }
        }

        return { start, length };
    }

    _selectWordAt(coords, allowWhitespaceOnlySelection) {
        const wordPosition = this._getWordAt(
            coords,
            allowWhitespaceOnlySelection
        );
        if (wordPosition) {
            // Adjust negative start value
            while (wordPosition.start < 0) {
                wordPosition.start += this._bufferService.cols;
                coords[1]--;
            }
            this._model.selectionStart = [wordPosition.start, coords[1]];
            this._model.selectionStartLength = wordPosition.length;
        }
    }

    _selectToWordAt(coords) {
        const wordPosition = this._getWordAt(coords, true);
        if (wordPosition) {
            let endRow = coords[1];

            // Adjust negative start value
            while (wordPosition.start < 0) {
                wordPosition.start += this._bufferService.cols;
                endRow--;
            }

            // Adjust wrapped length value, this only needs to happen when values are reversed as in that
            // case we're interested in the start of the word, not the end
            if (!this._model.areSelectionValuesReversed()) {
                while (
                    wordPosition.start + wordPosition.length >
                    this._bufferService.cols
                ) {
                    wordPosition.length -= this._bufferService.cols;
                    endRow++;
                }
            }

            this._model.selectionEnd = [
                this._model.areSelectionValuesReversed()
                    ? wordPosition.start
                    : wordPosition.start + wordPosition.length,
                endRow,
            ];
        }
    }

    _isCharWordSeparator(cell) {
        // Zero width characters are never separators as they are always to the
        // right of wide characters
        if (cell.getWidth() === 0) {
            return false;
        }

        /*
            I just pulled this separator pattern from my Windows Terminal settings
        */

        return (
            ` /\()"'-.,:;<>~!@#$%^&*|+=[]{}~?│`.indexOf(cell.getChars()) >= 0
        );
    }

    _selectLineAt(line) {
        if (isNaN(line)) {
            return;
        }
        const wrappedRange =
            this._bufferService.buffer.getWrappedRangeForLine(line);
        this._model.selectionStart = [0, wrappedRange.first];
        this._model.selectionEnd = [
            this._bufferService.cols,
            wrappedRange.last,
        ];
        this._model.selectionStartLength = 0;
    }
}

module.exports = SelectionService;
