/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

class SelectionModel {
    constructor(_bufferService) {
        this.isSelectAllActive = false;
        this.selectionStartLength = 0;
        this.selectionStart;
        this.selectionEnd;

        this._bufferService = _bufferService;
    }

    clearSelection() {
        this.selectionStart = undefined;
        this.selectionEnd = undefined;
        this.isSelectAllActive = false;
        this.selectionStartLength = 0;
    }

    get finalSelectionStart() {
        if (this.isSelectAllActive) {
            return [0, 0];
        }

        if (!this.selectionEnd || !this.selectionStart) {
            return this.selectionStart;
        }

        return this.areSelectionValuesReversed()
            ? this.selectionEnd
            : this.selectionStart;
    }

    get finalSelectionEnd() {
        if (this.isSelectAllActive) {
            return [
                this._bufferService.cols,
                this._bufferService.buffer.ybase + this._bufferService.rows - 1,
            ];
        }

        if (!this.selectionStart) {
            return undefined;
        }

        // Use the selection start + length if the end doesn't exist or they're reversed
        if (!this.selectionEnd || this.areSelectionValuesReversed()) {
            const startPlusLength =
                this.selectionStart[0] + this.selectionStartLength;
            if (startPlusLength > this._bufferService.cols) {
                return [
                    startPlusLength % this._bufferService.cols,
                    this.selectionStart[1] +
                        Math.floor(startPlusLength / this._bufferService.cols),
                ];
            }
            return [startPlusLength, this.selectionStart[1]];
        }

        // Ensure the the word/line is selected after a double/triple click
        if (this.selectionStartLength) {
            // Select the larger of the two when start and end are on the same line
            if (this.selectionEnd[1] === this.selectionStart[1]) {
                return [
                    Math.max(
                        this.selectionStart[0] + this.selectionStartLength,
                        this.selectionEnd[0]
                    ),
                    this.selectionEnd[1],
                ];
            }
        }
        return this.selectionEnd;
    }

    areSelectionValuesReversed() {
        const start = this.selectionStart;
        const end = this.selectionEnd;
        if (!start || !end) {
            return false;
        }
        return start[1] > end[1] || (start[1] === end[1] && start[0] > end[0]);
    }

    onTrim(amount) {
        // Adjust the selection position based on the trimmed amount.
        if (this.selectionStart) {
            this.selectionStart[1] -= amount;
        }
        if (this.selectionEnd) {
            this.selectionEnd[1] -= amount;
        }

        // The selection has moved off the buffer, clear it.
        if (this.selectionEnd && this.selectionEnd[1] < 0) {
            this.clearSelection();
            return true;
        }

        // If the selection start is trimmed, ensure the start column is 0.
        if (this.selectionStart && this.selectionStart[1] < 0) {
            this.selectionStart[1] = 0;
        }
        return false;
    }
}

module.exports = SelectionModel;
