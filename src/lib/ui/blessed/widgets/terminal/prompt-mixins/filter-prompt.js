const blessed = require('blessed');
const { isRegex, isValidRegex, prepRegex } = require('../util/regex');
const UI = require('../../../layouts/ui');
const debounce = require('lodash.debounce');

const Terminal = require('xterm').Terminal;

const { Unicode11Addon } = require('xterm-addon-unicode11');
const SearchAddon = require('../addons/search');
const { throwIfEmpty } = require('rxjs/operators');

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

class FilterPrompt {
    initializer() {
        this._filter = false;

        this.filtersIndex = 0;
        this.linefeeding = false;
        this.stayFiltered = false;

        this.filterScrollUpdate = debounce(
            this.filterScrollUpdate.bind(this),
            250,
            { leading: false, trailing: true }
        );

        this.key(this.options.filterKey || 'C-f', () =>
            this.openFilterPrompt()
        );

        this.key(this.options.persistFilterKey || 'C-g', () => {
            this.stayFiltered = false;
            this.filter = false;
        });
    }

    filterScrollUpdate() {
        this.startLine = this.getLine(undefined, true);
        this.scrollAtLines[this.lineCount] = this.getScroll();
        this.startScrollPerc = this.getScrollPerc();
        this.scrollResizePerc = this.getScroll() / this.lineCount;
    }

    get filter() {
        return this._filter;
    }

    set filter(value) {
        if (this.filtering || this.setFilter) {
            return;
        }

        this.setFilter = true;

        if (typeof value === 'string') {
            value = value.trim();
        }

        if (value === this._filter) {
            return;
        }

        const oldValue = this._filter;

        this._filter = value;

        if (oldValue !== value && value !== false) {
            this._search.enable();

            this.getFilteredLines();

            this._search.disable();

            this._filterSearch.enable();
        } else {
            this.clearFilterTerm();
            this._filterSearch.disable();
            this._search.enable();
        }

        if (oldValue !== value) {
            setTimeout(() => {
                this.resize(true);

                if (this.parent.updateSelectedStyle) {
                    this.parent.updateSelectedStyle();
                }

                this.setFilter = false;
            });
        }
    }

    getFilteredLines() {
        this.skipData = true;
        this.filtering = true;

        const lines = [];
        let startRow = null;

        this._term.clearSelection();
        this.clearFilterTerm();

        this._search.findNext(this.filter, {
            caseSensitive: false,
            doScroll: false,
            regex: this.filterRegex,
        });

        if (this._term.hasSelection()) {
            let pos = this._term.getSelectionPosition();
            let xtermRow = pos.startRow;

            startRow = xtermRow;

            let line = this.preWrite(this._search._foundLine);

            lines.push(line);

            this._search.findNext(this.filter, {
                caseSensitive: false,
                doScroll: false,
                regex: this.filterRegex,
            });

            pos = this._term.getSelectionPosition();
            xtermRow = pos.startRow;

            while (xtermRow > startRow) {
                line = this.preWrite(this._search._foundLine);

                lines.push(line);

                this._search.findNext(this.filter, {
                    caseSensitive: false,
                    doScroll: false,
                    regex: this.filterRegex,
                });

                pos = this._term.getSelectionPosition();
                xtermRow = pos.startRow;
            }

            this._term.clearSelection();

            this.skipData = false;

            this._filterTerm.write(lines.join('\n') + '\n', () => {
                this.filtering = false;
                this.setScrollPerc(0);
            });
        } else {
            this._term.clearSelection();
            this.skipData = false;
            this.filtering = false;
        }
    }

    initFilterTerm() {
        if (this._filterTerm) {
            return;
        }

        this._filterTerm = new Terminal({
            name: 'xterm-256color',
            allowTransparency: false,
            convertEol: ['process', 'markdown'].includes(this.options.termType)
                ? true
                : this.options.convertEol || false,
            cols: this.cols,
            rows: this.rows,
            scrollback: this.options.scrollback,
            drawBoldTextInBrightColors: false,
        });

        this._filterTerm._core._inputHandler._parser.setErrorHandler(() => ({
            abort: false,
        }));

        this._filterTerm._core.refresh = (start, end) => {
            if (
                !this.parent ||
                this.startingUp ||
                this.skipData ||
                this.userClose
            ) {
                return;
            }

            if (this.filter && this.filter !== '') {
                this.termRender();
            }
        };

        this._filterTerm._core.viewport = {
            syncScrollArea: () => {},
        };

        this._filterTerm._core._keyDown = () => {};
        this._filterTerm._core._keyPress = () => {};

        this._filterTerm.loadAddon(new Unicode11Addon());
        this._filterTerm.unicode.activeVersion = '11';

        this._filterSearch = new SearchAddon(this._filterTerm, this);
    }

    submitFilter(prompt) {
        if (this.copyPromptOpen) {
            return;
        }

        if (this.linefeeding) {
            return;
        }

        if (this.filtering) this.linefeeding = true;

        let value = prompt.getValue().trim();

        let prepped;

        let isRegexValue = false;

        this.filterRegex = false;

        if (value) {
            if (this.filter !== value) {
                if (isRegex(value)) {
                    isRegexValue = true;
                    prepped = prepRegex(value);
                    if (!isValidRegex(prepped)) {
                        prompt.readInput(false);
                        this.termRender(true);
                        this.linefeeding = false;
                        return;
                    }
                }

                this.filterRegex = isRegexValue;
                this.filter = isRegexValue ? prepped : value;

                this.stayFiltered = this.filter;

                if (value !== '' && !UI.filters.includes(value)) {
                    UI.filters.push(value);
                    this.filtersIndex = UI.filters.length - 1;
                } else if (value !== '' && UI.filters.includes(value)) {
                    this.filtersIndex = UI.filters.indexOf(value);
                }

                if (this.parent && this.parent.type === 'panel') {
                    this.parent.selected = true;
                }
            }
        }

        this.linefeeding = false;
    }

    openFilterPrompt() {
        if (this.promptOpen) {
            return;
        }

        this.promptOpen = true;

        this.initFilterTerm();

        const create = this.promptContainer('Filter');

        this.filterPrompt = blessed.textarea({
            parent: this.pContainer,
            inputOnFocus: false,
            value: 'testing',
            style: {
                fg: 'white',
            },
            height: 1,
            width: '99%-10',
            top: 'center',
            left: 8,
            value: '',
            keys: false,
        });

        if (this.filtersIndex < 0) {
            this.filtersIndex = 0;
        } else if (this.filtersIndex >= UI.filters.length) {
            this.filtersIndex = UI.filters.length - 1;
        }

        this.filterPrompt.removeListener('submit');

        this.filterPrompt.key('escape', () => {
            this.filterPrompt.cancel(false);
        });

        this.filterPrompt.on('focus', () => {
            if (!this.filterPrompt.parent) {
                return;
            }

            this.filterPrompt.show();

            this.filterPrompt.readInput();

            if (!this.switching && !this.stayFiltered) {
                this.filterPrompt.setValue('');
            } else if (this.stayFiltered) {
                const index = UI.filters.indexOf(this.stayFiltered);
                if (index >= 0) {
                    this.filtersIndex = index;
                    this.filterPrompt.setValue(
                        UI.filters[this.filtersIndex],
                        true
                    );
                }
            } else if (UI.filters.length && UI.filters[this.filtersIndex]) {
                this.filterPrompt.setValue(UI.filters[this.filtersIndex], true);
            } else {
                this.filterPrompt.setValue('');
            }

            if (this.parent && this.parent.type === 'panel') {
                this.parent.selected = true;
            }

            this.switching = false;
        });

        this.filterPrompt.on('cancel', (cancelFilter = false) => {
            if (this.copyPromptOpen) {
                return;
            }

            this.promptOpen = false;

            this.filterPrompt.destroy();

            if (this.parent && this.parent.type === 'panel') {
                this.parent.selected = true;
            }

            if (this.switching) {
                this.openSearchPrompt();
                return;
            }

            if (cancelFilter) {
                this.filter = false;
            }

            this.pContainer.hide();

            process.nextTick(() => {
                this.parentEmit('prompt close');
            });

            UI.hideCursor(this.screen);

            if (cancelFilter) {
                this.focus();
            }

            this.screen.render();
        });

        this.filterPrompt.key('C-s', () => {
            if (!this.copyPromptOpen && !this.filterPrompt.hidden) {
                this.switching = true;
                this.filterPrompt.hide();
            }
        });

        this.filterPrompt.key('C-g', () => {
            this.stayFiltered = false;
            this.filterPrompt.emit('cancel', true);
        });

        this.filterPrompt.key('C-p', () => {
            this.copyPromptOpen = true;
            this.pContainer.hide();
            this.openCopyPrompt();
        });

        this.filterPrompt.key('C-x', () => {
            if (this.copyPromptOpen || this.filterPrompt.hidden) {
                return;
            }
            this.filterPrompt.setValue('');
            this.filter = '';
            this.termRender(true);
        });

        this.filterPrompt.key('return', () => {
            if (this.filtering) {
                process.nextTick(() => {
                    this.submitFilter(this.filterPrompt);
                });
            } else {
                this.submitFilter(this.filterPrompt);
            }
        });

        const direction = () => {
            let value = UI.filters[this.filtersIndex];
            let prepped;

            let isRegexValue = false;

            if (this.filter !== value) {
                if (isRegex(value)) {
                    isRegexValue = true;
                    prepped = prepRegex(value);
                    if (!isValidRegex(prepped)) {
                        this.filterPrompt.readInput(false);
                        this.termRender(true);
                        return;
                    }
                }

                this.filter = isRegexValue ? prepped : value;

                if (this.stayFiltered) {
                    this.stayFiltered = this.filter;
                    if (this.updateLabelAndStyle) {
                        this.updateLabelAndStyle();
                    }
                }

                this.filterPrompt.setValue(value, true);
                this.termRender(true);
            }
        };

        this.filterPrompt.key('C-up', () => {
            if (this.copyPromptOpen || this.filterPrompt.hidden) {
                return;
            }

            this.filtersIndex--;
            if (this.filtersIndex < 0) {
                this.filtersIndex = UI.filters.length - 1;
            }

            if (!!UI.filters[this.filtersIndex]) {
                direction();
            }
        });

        this.filterPrompt.key('C-down', () => {
            if (this.copyPromptOpen || this.filterPrompt.hidden) {
                return;
            }
            this.filtersIndex++;
            if (this.filtersIndex > UI.filters.length - 1) {
                this.filtersIndex = 0;
            }

            if (!!UI.filters[this.filtersIndex]) {
                direction();
            }
        });

        this.filterPrompt.on('keypress', (ch, key) => {
            if (this.screen.focused === this.filterPrompt) {
                if (
                    !key.ctrl &&
                    ['up', 'down', 'pageup', 'pagedown'].includes(key.name)
                ) {
                    if (this.copyPromptOpen || this.filterPrompt.hidden) {
                        return;
                    }
                    this.emit(`key ${key.full}`);
                }
            }
        });

        this.filterPrompt.key('C-q', () => {
            this.filterPrompt.destroy();
            this.promptOpen = false;
            this.filter = false;
            this.pContainer.hide();
            UI.hideCursor(this.screen);
        });

        if (create) {
            this.screen.append(this.pContainer);
        } else {
            this.pContainer.show();
        }

        this.termRender(true);

        this.filterPrompt.focus();

        this.parentEmit('prompt open');

        this.promptOpen = true;
    }
}

module.exports = FilterPrompt;
