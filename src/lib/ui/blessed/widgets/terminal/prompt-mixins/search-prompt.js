const blessed = require('blessed');
const { isRegex, isValidRegex, prepRegex } = require('../util/regex');
const UI = require('../../../layouts/ui');

class SearchPrompt {
    initializer(opts) {
        this.searchActive = false;

        this.searchString = '';

        this.searchesIndex = 0;
        this.lastSearch = '';
        this.okCancel = false;

        this.clickCancel = this.clickCancel.bind(this);

        this.key(
            this.options.searchKey || 'C-s',
            this.openSearchPrompt.bind(this)
        );
    }

    get search() {
        if (!this.filter) {
            return this._search;
        }

        return this._filterSearch;
    }

    findNext(string, searchOptions = {}) {
        searchOptions = {
            caseSensitive: false,
            ...searchOptions,
        };

        if (searchOptions.regex) {
            this.searchRegex = true;
        } else {
            this.searchRegex = false;
        }

        if (searchOptions.reset) {
            this.clearSelection();
        }

        this.searchActive = true;

        if (this.searchString !== string) {
            this.emit('searching', string);
        }

        this.searchString = string;

        this.search.findNext(string, searchOptions);

        if (!RegExp(string, 'gi').test(this.selectionText.trim())) {
            this.search.findNext(string, searchOptions);
        }

        this.termRender(true);
    }

    findPrevious(string, searchOptions = {}) {
        searchOptions = {
            caseSensitive: false,
            ...searchOptions,
        };

        if (searchOptions.regex) {
            this.searchRegex = true;
        } else {
            this.searchRegex = false;
        }

        if (searchOptions.reset) {
            this.clearSelection();
        }

        this.searchActive = true;

        if (this.searchString !== string) {
            this.emit('searching', string);
        }

        this.searchString = string;

        this.search.findPrevious(string, searchOptions);

        if (!RegExp(string, 'gi').test(this.selectionText.trim().trim())) {
            this.search.findPrevious(string, searchOptions);
        }

        this.termRender(true);
    }

    findFirst(string, searchOptions = {}) {
        this.clearSelection();
        this.searchActive = true;

        if (searchOptions.regex) {
            this.searchRegex = true;
        } else {
            this.searchRegex = false;
        }

        if (this.searchString !== string) {
            this.emit('searching', string);
        }

        this.searchString = string;
        this.findNext(string, searchOptions);

        if (!RegExp(string, 'gi').test(this.selectionText.trim())) {
            this.search.findNext(string, searchOptions);
        }

        this.termRender(true);
    }

    findLast(string, searchOptions = {}) {
        this.clearSelection();
        this.searchActive = true;

        if (searchOptions.regex) {
            this.searchRegex = true;
        } else {
            this.searchRegex = false;
        }

        if (this.searchString !== string) {
            this.emit('searching', string);
        }

        this.searchString = string;
        this.findPrevious(string, searchOptions);

        if (!RegExp(string, 'gi').test(this.selectionText.trim())) {
            this.search.findPrevious(string, searchOptions);
        }

        this.termRender(true);
    }

    clickCancel() {
        this.okCancel = true;
        this.searchPrompt.cancel();
    }

    openSearchPrompt() {
        if (this.promptOpen) {
            return;
        }

        this.promptOpen = true;
        this.okCancel = false;

        const create = this.promptContainer('Search');

        this.searchPrompt = blessed.textarea({
            parent: this.pContainer,
            inputOnFocus: false,
            style: {
                fg: 'brightwhite',
            },
            height: 1,
            width: '99%-10',
            top: 'center',
            left: 8,
            value: '',
        });

        this.searchPrompt.removeListener('submit');

        this.searchPrompt.on('focus', () => {
            if (!this.searchPrompt.parent) {
                return;
            }

            this.lastSearch = '';

            this.searchPrompt.readInput();

            this.screen.on('mousedown', this.clickCancel);

            if (this.switching) {
                this.searchPrompt.setValue('');
            } else if (UI.searches.length) {
                this.searchPrompt.setValue(
                    UI.searches[this.searchesIndex],
                    true
                );
            } else {
                this.searchPrompt.setValue('');
            }

            if (!this.switching) {
                UI.showCursor(this.screen);
            }
        });

        this.searchPrompt.on('cancel', () => {
            if (!this.okCancel) {
                return;
            }

            this.screen.off('mousedown', this.clickCancel);

            this.clearSelection(true);

            if (!this.searchPrompt.destroyed) {
                this.searchPrompt.destroy();
            }

            this.promptOpen = false;

            if (this.switching) {
                this.openFilterPrompt();
                this.termRender(true);
                return;
            }

            this.pContainer.hide();

            // Do this on nextTick to prevent flickering if user press Ctrl-C while prompt open
            process.nextTick(() => {
                this.parentEmit('prompt close');
            });

            UI.hideCursor(this.screen);

            this.focus();

            this.termRender(true);
        });

        this.searchPrompt.key('C-x', () => {
            this.searchPrompt.setValue('');
            this.clearSelection();
            this.termRender(true);
        });

        this.searchPrompt.key('C-f', () => {
            this.switching = true;
            this.okCancel = true;
            this.searchPrompt.cancel();
        });

        this.searchPrompt.key('C-g', () => {
            this.stayFiltered = false;
            if (this.filterPrompt && this.filterPrompt.emit) {
                this.filterPrompt.emit('cancel', true);
            }
        });

        this.searching = false;

        this.searchPrompt.key('return', () => {
            // return key event seems to be getting fired twice
            // this is happening generally...
            if (this.searching) {
                return;
            }

            this.searching = true;

            let value = this.searchPrompt.getValue().trim();
            let prepped = value;

            let isRegexValue = false;

            if (isRegex(value)) {
                isRegexValue = true;
                prepped = prepRegex(value);
                if (!isValidRegex(prepped)) {
                    this.termRender();
                    return;
                }
            }

            this.findNext(prepped, {
                regex: isRegexValue,
                reset: this.lastSearch !== prepped,
            });

            this.lastSearch = prepped;

            const selection = this.getSelectionPosition();
            const dim = this.dimensions;

            if (selection && selection.endRow >= this.getScroll() + dim.rows + 1) {
                this.scroll(1);
            }

            if (selection && value !== '') {
                if (!UI.searches.includes(value)) {
                    UI.searches.push(value);
                    this.searchesIndex = UI.searches.length - 1;
                } else if (UI.searches.includes(value)) {
                    this.searchesIndex = UI.searches.indexOf(value);
                }
            }

            process.nextTick(() => {
                this.searching = false;
            });
        });

        this.searchPrompt.key('escape', () => {
            this.okCancel = true;
            this.searchPrompt.emit('cancel');
        });

        this.searchPrompt.key('up', () => {
            let value = this.searchPrompt.getValue().trim();
            let prepped = value;

            let isRegexValue = false;

            if (isRegex(value)) {
                isRegexValue = true;
                prepped = prepRegex(value);
                if (!isValidRegex(prepped)) {
                    this.termRender();
                    return;
                }
            }

            this.findPrevious(prepped, {
                regex: isRegexValue,
            });

            this.lastSearch = prepped;
        });

        this.searchPrompt.key('down', () => {
            let value = this.searchPrompt.getValue().trim();
            let prepped = value;

            let isRegexValue = false;

            if (isRegex(value)) {
                isRegexValue = true;
                prepped = prepRegex(value);
                if (!isValidRegex(prepped)) {
                    this.termRender(true);
                    return;
                }
            }

            this.findNext(prepped, {
                regex: isRegexValue,
            });

            this.lastSearch = prepped;
        });

        this.searchPrompt.key('C-home', () => {
            let value = this.searchPrompt.getValue().trim();
            let prepped = value;

            let isRegexValue = false;

            if (isRegex(value)) {
                isRegexValue = true;
                prepped = prepRegex(value);
                if (!isValidRegex(prepped)) {
                    this.termRender(true);
                    return;
                }
            }

            this.findFirst(prepped, {
                regex: isRegexValue,
            });
        });

        this.searchPrompt.key('C-end', () => {
            let value = this.searchPrompt.getValue().trim();
            let prepped = value;

            let isRegexValue = false;

            if (isRegex(value)) {
                isRegexValue = true;
                prepped = prepRegex(value);
                if (!isValidRegex(prepped)) {
                    this.termRender(true);
                    return;
                }
            }

            this.findLast(prepped, {
                reset: true,
                regex: isRegexValue,
            });
        });

        const direction = () => {
            let value = UI.searches[this.searchesIndex].trim();
            let prepped = value;

            let isRegexValue = false;

            if (isRegex(value)) {
                isRegexValue = true;
                prepped = prepRegex(value);
                if (!isValidRegex(prepped)) {
                    //    this.clearSelection();
                    this.searchPrompt.setValue(value, true);
                    this.termRender(true);
                    return;
                }
            }

            //  this.clearSelection();
            this.findNext(prepped, {
                regex: isRegexValue,
            });
            this.searchPrompt.setValue(value, true);

            this.termRender(true);
        };

        this.searchPrompt.key('C-up', () => {
            this.searchesIndex--;
            if (this.searchesIndex < 0) {
                this.searchesIndex = UI.searches.length - 1;
            }

            if (UI.searches[this.searchesIndex]) {
                direction();
            }
        });

        this.searchPrompt.key('C-down', () => {
            this.searchesIndex++;
            if (this.searchesIndex > UI.searches.length - 1) {
                this.searchesIndex = 0;
            }

            if (UI.searches[this.searchesIndex]) {
                direction();
            }
        });

        this.searchPrompt.key('C-c', () => {
            this.okCancel = true;
            this.clearSelection(true);
            this.searchPrompt.destroy();
            this.promptOpen = false;
            this.pContainer.hide();
            UI.hideCursor(this.screen);
        });

        if (create) {
            this.screen.append(this.pContainer);
        } else {
            this.pContainer.show();
        }

        this.termRender(true);

        this.searchPrompt.focus();

        this.parentEmit('prompt open');
    }
}

module.exports = SearchPrompt;
