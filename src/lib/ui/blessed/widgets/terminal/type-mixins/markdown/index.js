const CFonts = require('cfonts');
const marked = require('marked');
const TerminalRenderer = require('marked-terminal');
const chalk = require('chalk');
const memoize = require('lodash.memoize');
const toc = require('markdown-toc');
const { stripHtml } = require('string-strip-html');
const cardinalTheme = require('../../../../util/repl/cardinal-theme');
const stripAnsi = require('strip-ansi');
const chalkMemo = memoize(chalk.hex.bind(chalk));

const { getOptions } = require('./cfonts');

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

class TerminalMarkdownType {
    initializer(options) {
        options.termType = this.options.termType = 'markdown';
        options.wrap = false;

        this.startingUp = true;

        const markdownOptions = {
            style: options.markdownStyle || {
                codespan: chalkMemo('#73DF6E'),
                code: chalkMemo('#73DF6E'),
                link: chalkMemo('#6F9EFD'),
                href: chalkMemo('#0077ff').underline,
                heading: chalkMemo('#96ceff').bold,
                tableOptions: {
                    style: { 'padding-left': 0, 'padding-right': 0 },
                },
                emoji: true,
            },
            highlightOptions: options.highlightOptions || {
                theme: cardinalTheme,
            },
        };

        this.setOptions(
            markdownOptions.style,
            markdownOptions.highlightOptions
        );

        this.key(['C-z'], () => {
            this.destroy();
        });

        this.startScrollPerc = 0;
    }

    get uiType() {
        return 'markdown';
    }

    goToSection(content, lvl) {
        this.clearSelection();

        const search = '#'.repeat(lvl) + ' ' + content.trimLeft().trimRight();

        this.search.findNext(search);

        if (
            !search
                .toLowerCase()
                .includes(this.term.getSelection().toLowerCase())
        ) {
            this.search.findNext(search);
        }

        const offset = Math.floor((this.height - 2) / 2);

        this.scroll(offset);

        this.clearSelection();
    }

    async activateNext() {
        await this.loadContent();

        this.refresh = true;

        this.active = true;

        this.startingUp = false;

        this.setScrollPerc(0);

        setTimeout(() => {
            this.ready = true;

            if (this.onReady) {
                this.onReady(this);
            }
        });
    }

    loadContent() {
        return new Promise((resolve) => {
            const contentString = this.getMarkdown(this.options.contentString);

            let lines = contentString.split('\n');

            lines = lines.filter((line, index) => {
                if (
                    stripAnsi(line).trim() === '' &&
                    lines[index - 1] &&
                    stripAnsi(lines[index - 1]).trim() === '' &&
                    lines[index + 1] &&
                    stripAnsi(lines[index + 1]).trim() === ''
                ) {
                    return false;
                }

                return true;
            });

            const opts = getOptions(this.options.packageName);
            let niceText;

            if (typeof opts === 'string') {
                niceText = opts;
            } else {
                const { font, gradient, colors, transitionGradient } = opts;

                const prettyFont = CFonts.render(this.options.packageName, {
                    font,
                    gradient,
                    colors,
                    transitionGradient,
                    letterSpacing: ['grid', 'shade', 'slick'].includes(font)
                        ? 2
                        : 1,

                    spaceless: true,
                });

                niceText = prettyFont.string;
            }

            const lastLine = lines.pop();

            let foundText = false;

            for (const line of lines) {
                if (!foundText && stripAnsi(line).trim() !== '') {
                    foundText = true;
                    this.write(niceText + '\n');
                }

                if (foundText) {
                    this.write(line + '\n');
                }
            }

            this.write(lastLine + '\n', resolve);
        });
    }

    addLinesToToc(line, contents, index) {
        this.found = this.found === undefined ? 0 : this.found;

        if (line.includes('##')) {
            for (const con of contents.slice(this.found)) {
                con.content = con.content.replace(/`/g, '').trim();

                if (con.content.includes('![')) {
                    const i = con.content.indexOf('![');
                    con.content = con.content.slice(0, i - 1);
                }

                contents[con.i] = con;

                let testContent = con.content
                    .replace(/\?/g, '')
                    .replace(/!/g, '')
                    .replace(/\./g, '');

                const match = con.content.match(/[^a-z]/i);

                if (match && match[0] !== ' ' && match.index > 0) {
                    testContent = testContent
                        .substr(0, match.index + 1)
                        .replace(/[^a-z]/i, '')
                        .trim();
                }

                testContent = escapeRegExp(testContent);

                if (
                    // line.includes(testContent) ||
                    line.match(RegExp(testContent, 'i'))
                    //   RegExp(testContent, 'i').test(line) ||
                    //  line.match(RegExp(testContent, 'gi')) ||
                    // RegExp(testContent, 'gi').test(line)
                ) {
                    this.found = con.i + 1;
                    con.line = index;
                    contents[con.i] = con;
                    break;
                }
            }
        }
    }

    getMarkdown(str) {
        const contents = toc(str).json;

        str = marked(str).trimLeft();

        str = str
            .split('\n')
            .map((line, index) => {
                this.addLinesToToc(line, contents, index);
                return line;
            })
            .join('\n');

        this.toc = contents;

        this.listItems = [];

        this.toc.forEach((section) => {
            let { content, lvl } = section;

            if (lvl > 1 && lvl < 5) {
                const space = ' '.repeat((lvl - 1) * 3);

                this.listItems.push({
                    cmd: lvl,
                    name: `${space}${content}`,
                });
            }
        });

        return stripHtml(str).result;
    }

    setOptions(style, highlightOptions = {}) {
        marked.setOptions({
            renderer: new TerminalRenderer(style, highlightOptions),
        });
    }
}

module.exports = TerminalMarkdownType;
