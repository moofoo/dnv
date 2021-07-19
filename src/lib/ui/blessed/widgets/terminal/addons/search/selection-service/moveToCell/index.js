/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

/*
    I've modified this so that Alt-clicking works in other situations where you might have a cursor in the terminal, besides the command line - like in an editor (Nano)

    Extremely simple algorithm:
        - move to column 0
        - move to target row
        - move to target column

    Also some typical editor-like behavior:
        - if target X is on an empty row, move targetX to 0
        - if targetX is greater than length of line (trimmed, so target is on un-touched cells), move to the last character in that line

    'onCommandLine' comes from the Blessed Terminal widget, it determines this while copying cells from the XTerm to Blessed buffer.
     This is also pretty simple: While looping through the cells, check for two:
        - a cell containing one of the characters '$', '>', or '#'.
        - the cell containing the cursor (by coordinates, provided by Xterm buffer, and by making sure the cell at those coordinates
          actually contains one of the cursor characters (_, |) or is inverse (block))

     If the cursor cell comes after the first, (going down the screen), then you're on a command line.
*/

const { C0 } = require('./escapes');

const Direction = {
    UP: 'A',
    DOWN: 'B',
    RIGHT: 'C',
    LEFT: 'D',
};

/**
 * Concatenates all the arrow sequences together.
 * Resets the starting row to an unwrapped row, moves to the requested row,
 * then moves to requested col.
 */
module.exports.moveToCellSequence = function (
    targetX,
    targetY,
    bufferService,
    applicationCursor,
    onCommandLine,
    debug
) {
    if (targetX < 0) {
        targetX = 0;
    }

    let startX = bufferService.buffer.x;
    let startY = bufferService.buffer.y;

    let codes = '';
    let direction;

    debug(`${targetX} ${targetY} ${startX} ${startY} ${onCommandLine}`);

    if (!onCommandLine) {
        const targetLine = bufferService.buffer.translateBufferLineToString(
            targetY,
            true
        );

        // Target row is empty, move to 0
        if (targetLine.trim().length === 0) {
            targetX = 0;
        } else if (
            targetLine.trim().length > 0 &&
            targetX > targetLine.length
        ) {
            //Target x > than trimmed line length, move to end of line on row
            targetX = targetLine.length;
        }
    }

    if (startY === targetY) {
        direction = startX > targetX ? Direction.LEFT : Direction.RIGHT;

        return repeat(
            Math.abs(startX - targetX),
            sequence(direction, applicationCursor)
        );
    }

    const wrappedCount = wrappedRowsCount(startY, targetY, bufferService);

    if (wrappedCount > 0) {
        if (!onCommandLine && targetX < startX) {
            const originalStartX = startX;

            startX = targetX - 1;
            if (startX < 0) {
                startX = 0;
            }

            codes += repeat(
                originalStartX - startX,
                sequence('D', applicationCursor)
            );
        }

        if (
            (onCommandLine && !bufferService.buffer.hasScrollback) ||
            (!onCommandLine && targetX >= startX)
        ) {
            return (
                codes +
                resetStartingRow(
                    startX,
                    startY,
                    targetX,
                    targetY,
                    bufferService,
                    applicationCursor
                ) +
                moveToRequestedRow(
                    startY,
                    targetY,
                    bufferService,
                    applicationCursor
                ) +
                moveToRequestedCol(
                    startX,
                    startY,
                    targetX,
                    targetY,
                    bufferService,
                    applicationCursor
                )
            );
        }
    } else if (!onCommandLine) {
        let sequen = '';

        if (startX > 0) {
            sequen = repeat(
                startX,
                sequence(Direction.LEFT, applicationCursor)
            );
        }

        direction = targetY > startY ? Direction.DOWN : Direction.UP;

        sequen += repeat(
            Math.abs(startY - targetY),
            sequence(direction, applicationCursor)
        );

        if (targetX > 0) {
            sequen += repeat(
                targetX,
                sequence(Direction.RIGHT, applicationCursor)
            );
        }

        return sequen;
    }

    // Only move horizontally for the normal buffer
    if (onCommandLine) {
        direction = startY > targetY ? Direction.LEFT : Direction.RIGHT;
        const rowDifference = Math.abs(startY - targetY);

        const cellsToMove =
            colsFromRowEnd(startY > targetY ? targetX : startX, bufferService) +
            (rowDifference - 1) * bufferService.cols +
            1 +
            colsFromRowBeginning(
                startY > targetY ? startX : targetX,
                bufferService
            );

        return repeat(cellsToMove, sequence(direction, applicationCursor));
    }
};

/**
 * Find the number of cols from a row beginning to a col.
 */
function colsFromRowBeginning(currX, bufferService) {
    const cols = currX - 1;
    if (cols < 0) {
        return 0;
    }

    return cols;
}

/**
 * Find the number of cols from a col to row end.
 */
function colsFromRowEnd(currX, bufferService) {
    return bufferService.cols - currX;
}

/**
 * If the initial position of the cursor is on a row that is wrapped, move the
 * cursor up to the first row that is not wrapped to have accurate vertical
 * positioning.
 */
function resetStartingRow(
    startX,
    startY,
    targetX,
    targetY,
    bufferService,
    applicationCursor
) {
    if (
        moveToRequestedRow(startY, targetY, bufferService, applicationCursor)
            .length === 0
    ) {
        return '';
    }
    return repeat(
        bufferLine(
            startX,
            startY,
            startX,
            startY - wrappedRowsForRow(bufferService, startY),
            false,
            bufferService
        ).length,
        sequence(Direction.LEFT, applicationCursor)
    );
}

/**
 * Using the reset starting and ending row, move to the requested row,
 * ignoring wrapped rows
 */
function moveToRequestedRow(startY, targetY, bufferService, applicationCursor) {
    const startRow = startY - wrappedRowsForRow(bufferService, startY);
    const endRow = targetY - wrappedRowsForRow(bufferService, targetY);

    const rowsToMove =
        Math.abs(startRow - endRow) -
        wrappedRowsCount(startY, targetY, bufferService);

    return repeat(
        rowsToMove,
        sequence(verticalDirection(startY, targetY), applicationCursor)
    );
}

/**
 * Move to the requested col on the ending row
 */
function moveToRequestedCol(
    startX,
    startY,
    targetX,
    targetY,
    bufferService,
    applicationCursor
) {
    let startRow;
    if (
        moveToRequestedRow(startY, targetY, bufferService, applicationCursor)
            .length > 0
    ) {
        startRow = targetY - wrappedRowsForRow(bufferService, targetY);
    } else {
        startRow = startY;
    }

    const endRow = targetY;
    const direction = horizontalDirection(
        startX,
        startY,
        targetX,
        targetY,
        bufferService,
        applicationCursor
    );

    return repeat(
        bufferLine(
            startX,
            startRow,
            targetX,
            endRow,
            direction === Direction.RIGHT,
            bufferService
        ).length,
        sequence(direction, applicationCursor)
    );
}

/**
 * Utility functions
 */

/**
 * Calculates the number of wrapped rows between the unwrapped starting and
 * ending rows. These rows need to ignored since the cursor skips over them.
 */
function wrappedRowsCount(startY, targetY, bufferService) {
    let wrappedRows = 0;
    const startRow = startY - wrappedRowsForRow(bufferService, startY);
    const endRow = targetY - wrappedRowsForRow(bufferService, targetY);

    for (let i = 0; i < Math.abs(startRow - endRow); i++) {
        const direction =
            verticalDirection(startY, targetY) === Direction.UP ? -1 : 1;
        const line = bufferService.buffer.lines.get(startRow + direction * i);
        if (line && line.isWrapped) {
            wrappedRows++;
        }
    }

    return wrappedRows;
}

/**
 * Calculates the number of wrapped rows that make up a given row.
 * @param currentRow The row to determine how many wrapped rows make it up
 */
function wrappedRowsForRow(bufferService, currentRow) {
    let rowCount = 0;
    let line = bufferService.buffer.lines.get(currentRow);
    let lineWraps = line && line.isWrapped;

    while (lineWraps && currentRow >= 0 && currentRow < bufferService.rows) {
        rowCount++;
        line = bufferService.buffer.lines.get(--currentRow);
        lineWraps = line && line.isWrapped;
    }

    return rowCount;
}

/**
 * Direction determiners
 */

/**
 * Determines if the right or left arrow is needed
 */
function horizontalDirection(
    startX,
    startY,
    targetX,
    targetY,
    bufferService,
    applicationCursor
) {
    let startRow;
    if (
        moveToRequestedRow(targetX, targetY, bufferService, applicationCursor)
            .length > 0
    ) {
        startRow = targetY - wrappedRowsForRow(bufferService, targetY);
    } else {
        startRow = startY;
    }

    if (
        (startX < targetX && startRow <= targetY) || // down/right or same y/right
        (startX >= targetX && startRow < targetY)
    ) {
        // down/left or same y/left
        return Direction.RIGHT;
    }
    return Direction.LEFT;
}

/**
 * Determines if the up or down arrow is needed
 */
function verticalDirection(startY, targetY) {
    return startY > targetY ? Direction.UP : Direction.DOWN;
}

/**
 * Constructs the string of chars in the buffer from a starting row and col
 * to an ending row and col
 * @param startCol The starting column position
 * @param startRow The starting row position
 * @param endCol The ending column position
 * @param endRow The ending row position
 * @param forward Direction to move
 */
function bufferLine(
    startCol,
    startRow,
    endCol,
    endRow,
    forward,
    bufferService
) {
    let currentCol = startCol;
    let currentRow = startRow;
    let bufferStr = '';

    while (currentCol !== endCol || currentRow !== endRow) {
        currentCol += forward ? 1 : -1;

        if (forward && currentCol > bufferService.cols - 1) {
            bufferStr += bufferService.buffer.translateBufferLineToString(
                currentRow,
                false,
                startCol,
                currentCol
            );
            currentCol = 0;
            startCol = 0;
            currentRow++;
        } else if (!forward && currentCol < 0) {
            bufferStr += bufferService.buffer.translateBufferLineToString(
                currentRow,
                false,
                0,
                startCol + 1
            );
            currentCol = bufferService.cols - 1;
            startCol = currentCol;
            currentRow--;
        }
    }

    return (
        bufferStr +
        bufferService.buffer.translateBufferLineToString(
            currentRow,
            false,
            startCol,
            currentCol
        )
    );
}

/**
 * Constructs the escape sequence for clicking an arrow
 * @param direction The direction to move
 */
function sequence(direction, applicationCursor) {
    const mod = applicationCursor ? 'O' : '[';
    return C0.ESC + mod + direction;
}

/**
 * Returns a string repeated a given number of times
 * Polyfill from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat
 * @param count The number of times to repeat the string
 * @param string The string that is to be repeated
 */
function repeat(count, str) {
    count = Math.floor(count);
    let rpt = '';
    for (let i = 0; i < count; i++) {
        rpt += str;
    }
    return rpt;
}
