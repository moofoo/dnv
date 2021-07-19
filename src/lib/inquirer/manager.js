const cliCursor = require('cli-cursor');
const ansiEscapes = require('ansi-escapes');
const stripAnsi = require('strip-ansi');
let ScreenManager = require('inquirer/lib/utils/screen-manager');
const util = require('inquirer/lib/utils/readline');
const stringWidth = require('string-width');

function height(content) {
    return content.split('\n').length;
}

function lastLine(content) {
    const split = content.split('\n');
    return split[split.length - 1];
}

const eraseLines = (count, offset = 0) => {
    let clear = count ? ansiEscapes.cursorLeft : '';

    for (let i = 0; i < count; i++) {
        clear +=
            ansiEscapes.eraseEndLine +
            (i < count - (1 + offset) ? ansiEscapes.cursorMove(0, -1) : '');
    }

    return clear;
};

ScreenManager.prototype.hideCursor = function (force) {
    if (force || this.cursorVisible) {
        cliCursor.hide();
        this.cursorVisible = false;
    }
};

ScreenManager.prototype.showCursor = function (force) {
    if (force || !this.cursorVisible) {
        cliCursor.show();
        this.cursorVisible = true;
    }
};

ScreenManager.prototype.clean = function (extraLines) {
    if (this.fullClean) {
        this.rl.output.write(ansiEscapes.cursorTo(0, this.offset ? 1 : 0));
        this.rl.output.write(ansiEscapes.eraseDown);
    } else {
        if (extraLines > 0) {
            util.down(this.rl, extraLines);
        }

        this.rl.output.write(eraseLines(this.height));
    }
};

ScreenManager.prototype.renderWithSpinner = function (content, bottomContent) {
    if (this.spinnerId) {
        clearInterval(this.spinnerId);
    }

    let spinner;
    let contentFunc;
    let bottomContentFunc;

    if (bottomContent) {
        contentFunc = () => content;
        bottomContentFunc = () => {
            return '';
        }; //spinner.frame();
    } else {
        contentFunc = () => {
            return '';
        }; //spinner.frame();
        bottomContentFunc = () => '';
    }

    this.render(contentFunc(), bottomContentFunc(), true);
};

ScreenManager.prototype.render = function (
    content,
    bottomContent,
    cursorOn = false
) {
    if (this.cursorState === undefined) {
        this.rl.setMaxListeners(20);
        this.rl.input.setMaxListeners(20);
    }

    this.cursorVisible =
        this.cursorVisible === undefined ? false : this.cursorVibile;
    this.cursorState =
        this.cursorState === undefined ? this.cursorVisible : this.cursorState;

    this.rl.output.unmute();

    this.cursorState = this.cursorVisible;
    this.hideCursor();

    this.clean(this.extraLinesUnderPrompt);

    /**
     * Write message to screen and setPrompt to control backspace
     */

    var promptLine = lastLine(content);
    var rawPromptLine = stripAnsi(promptLine);

    // Remove the rl.line from our prompt. We can't rely on the content of
    // rl.line (mainly because of the password prompt), so just rely on it's
    // length.
    const line = this.rl.line.trim();

    var prompt = rawPromptLine;
    if (this.rl.line.length) {
        prompt = prompt.slice(0, -line.length);
    }

    this.rl.setPrompt(prompt);

    // SetPrompt will change cursor position, now we can get correct value
    var cursorPos = this.rl._getCursorPos();
    var width = this.normalizedCliWidth();

    this.cursorPos = cursorPos;

    content = this.forceLineReturn(content, width);
    if (bottomContent) {
        bottomContent = this.forceLineReturn(bottomContent, width);
    }

    // Manually insert an extra line if we're at the end of the line.
    // This prevent the cursor from appearing at the beginning of the
    // current line.
    if (rawPromptLine.length % width === 0) {
        content += '\n';
    }

    var fullContent = content + (bottomContent ? '\n' + bottomContent : '');
    this.rl.output.write(fullContent);

    this.fullContent = fullContent.trim();

    // We need to consider parts of the prompt under the cursor as part of the bottom
    // content in order to correctly cleanup and re-render.
    var promptLineUpDiff =
        Math.floor(rawPromptLine.length / width) - cursorPos.rows;
    var bottomContentHeight =
        promptLineUpDiff + (bottomContent ? height(bottomContent) : 0);
    if (bottomContentHeight > 0) {
        util.up(this.rl, bottomContentHeight);
    }

    // Reset cursor at the beginning of the line
    util.left(this.rl, stringWidth(lastLine(fullContent)));

    // Adjust cursor on the right
    if (cursorPos.cols > 0) {
        util.right(
            this.rl,
            cursorPos.cols > stringWidth(lastLine(fullContent))
                ? stringWidth(lastLine(fullContent))
                : cursorPos.cols
        );
    }

    this.extraLinesUnderPrompt = bottomContentHeight;
    this.height = height(fullContent);

    if (cursorOn) {
        this.showCursor(true);
    } else if (this.cursorState) {
        if (cursorPos.cols > 0) {
            this.showCursor();
        }
    }

    this.rl.output.mute();
};
