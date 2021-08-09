const Pty = require('node-pty');
const os = require('os');
const stripAnsi = require('strip-ansi');
const parseCommand = require('../util/parse-command');
const MuteStream = require('mute-stream');
const destroy = require('destroy');

const debounce = require('lodash.debounce');

const { emitKeypressEvents } = require('../../../patched/keys');
const { Buffer } = require('buffer');

const {
    getTermBufferer,
    stopBuffering,
} = require('../util/terminal-buffering');

class TerminalShellType {
    initializer(options) {
        this.shell =
            options.termType === 'shell' || options.termType === 'program';

        if (this.shell) {
            this.stdin = this.options.stdin || this.screen.program.input;

            this.bindit = this.bindit.bind(this);

            this.bindit([
                'input',
                'onPtyData',
                'onTermData',
                'onBinaryData',
                'muteWrite',
            ]);

            this.stdin.setDefaultEncoding('utf-8');

            this.input = debounce(this.input, 5, {
                leading: true,
                trailing: true,
            });

            this.inactiveOk = false;

            this._muteStream = null;

            this.stdinOn = false;
            this.skipInputDataOnce = false;

            this.blinking = true;
            this._cursorBlinkOn = false;

            this._returnPressed = false;

            this.userInput = false;
            this.commandLineLines = [];
            this._onCommandLine = false;
            this._shellProgram =
                options.termType === 'program' ||
                options.shellType === 'script';
            this.lastInputLine = '';

            this.lastCommand = '';
            this.lastArguments = '';

            if (this.options.termType === 'shell') {
                this.on('term write', (data) => {
                    if (this.checkInput > 0) {
                        this.checkInput--;
                        this.updateInputLine(data);
                    }
                });
            }

            this.on('focus', () => {
                setTimeout(() => this.shellStdinToggle(true));
            });

            this.on('blur', () => {
                setTimeout(() => this.shellStdinToggle(false));
            });

            this.key(['C-z'], () => {
                if (this.options.pty && !this.writable) {
                    this.emit('destroy');
                }
            });

            this.key('S-pageup', (ch, key) => {
                this.pageKey(key, this.fastScroll * -1);
            });

            this.key('S-pagedown', (ch, key) => {
                this.pageKey(key, this.fastScroll);
            });

            this.key('C-pageup', (ch, key) => {
                this.pageKey(key, (this.rows - 2) * -1);
            });

            this.key('C-pagedown', (ch, key) => {
                this.pageKey(key, this.rows - 2);
            });

            this.key('M-pageup', (ch, key) => {
                this.pageKey(key, 0);
            });

            this.key('M-pagedown', (ch, key) => {
                this.pageKey(key, 100);
            });

            /*   this.on('shell program', () => {
                if (
                    this.options.shellType !== 'repl' &&
                    this.lastCommand !== '' &&
                    this.options.addToRecent
                ) {
                    this.options.addToRecent(this.lastCommand);
                }
            });
            */

            this.inputActions = options.inputAction || [];

            if (this.options.shellType !== 'repl') {
                this.inputActions.push({
                    returned: false,
                    match: 'exit',
                    fn: function () {
                        this.persisting = false;
                    }.bind(this),
                    off: function () {
                        setTimeout(() => {
                            this.persisting = true;
                        }, 150);
                    }.bind(this),
                });
            }
        }
    }

    set shellProgram(value) {
        if (value !== this._shellProgram && value) {
            this.emit('shell program', this);
        }

        this._shellProgram = value;
    }

    get shellProgram() {
        if (!this.shell || !this.ready || !this.active) {
            return false;
        }

        return this._shellProgram;
    }

    get onCommandLine() {
        return this._onCommandLine;
    }

    set onCommandLine(value) {
        this._onCommandLine = value;
        if (value) {
            this.cursorBlinking = true;
            this.options.hideCursor = false;
        }
    }

    get muteStream() {
        if (!this._muteStream) {
            this._muteStream = new MuteStream();
            emitKeypressEvents(this._muteStream, true);
        }

        return this._muteStream;
    }

    set cursorBlinking(value) {
        if (
            this.options.cursorBlink
        ) {

            clearInterval(this.cursorBlinkTimeout);
            if (value) {
                this.cursorBlinkTimeout = setInterval(() => {
                    if (this.term) {
                        this.blinking = !this.blinking;
                        if (!this.hidden && this.screen.focused === this) {
                            this.termRender();
                        }
                    }
                }, 450);
            }
        }

        this._cursorBlinkOn = value;
    }

    get cursorBlinking() {
        return this._cursorBlinkOn;
    }

    get cursorX() {
        return this._cursorX;
    }

    get cursorY() {
        return this._cursorY;
    }

    set cursorX(value) {
        const oldValue = this._cursorX;
        this._cursorX = value;

        if (oldValue !== value && this.options.showConsoleCursor) {
            this.screen.program.cup(this.cursorY, this.cursorX);
        }
    }

    set cursorY(value) {
        const oldValue = this._cursorY;
        this._cursorY = value;

        if (oldValue !== value && this.options.showConsoleCursor) {
            this.screen.program.cup(this.cursorY, this.cursorX);
        }
    }

    pageKey(key, scroll) {
        if (this.doKeyScroll(key)) {
            if (scroll === 0 || scroll === 100) {
                this.setScrollPerc(scroll);
            } else {
                this.scroll(scroll);
            }
        }
    }

    muteWrite(data) {
        this.muteStream.write(data);
    }

    onBinaryData(data) {
        if (this.writable) {
            this.pty.write(Buffer.from(data, 'binary'));
        }
    }

    onTermData(data) {
        if (this.writable) {
            this.pty.write(data);
        }
    }

    onPtyData(data) {
        if (this && this.term) {
            this.write(data);
        }
    }

    spawnFork() {
        const ptyOpts = {
            name: this.options.termName,
            cwd: this.options.cwd,
            env: this.options.env,
            cols: this.cols,
            rows: this.rows,
            handleFlowControl: false,
        };

        let command = this.options.command;

        if (this.options.command) {
            let bashCommand;

            if (command.includes(' -c ')) {
                bashCommand = command.split('-c')[1];
                command = command.replace(bashCommand, '');

                bashCommand = bashCommand.trimLeft();
            }

            const commandArray = parseCommand(command);

            if (bashCommand) {
                bashCommand = bashCommand
                    .replace("'' /bin/bash", "''/bin/bash")
                    .replace("'' /bin/sh", "''/bin/sh");
                commandArray[1].push(bashCommand);
            }

            if (os.platform() === 'win32') {
                this.pty = Pty.spawn(
                    commandArray[0],
                    commandArray[1].join(' '),
                    ptyOpts
                );
            } else {
                if (this.options.workingDir) {
                    ptyOpts.cwd = this.options.workingDir;
                }

                this.pty = Pty.spawn(...commandArray, ptyOpts);
            }
        } else {
            this.pty = Pty.fork(
                process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'],
                this.options.args,
                ptyOpts
            );
        }

        this.pty.flowResume = function () {
            if (!this.stopped) {
                this.write('\x11');
            }
        }.bind(this.pty);

        this.pty.flowPause = function () {
            this.write('\x13');
        }.bind(this.pty);

        this.pty.flowStop = function () {
            this.stopped = true;
            this.flowPause();
        }.bind(this.pty);

        this.pty.flowGo = function () {
            this.stopped = false;
            this.flowResume();
        }.bind(this.pty);
    }

    createPty() {
        if (this.restarting) {
            this.initTime = null;
        }

        this.initTime = this.initTime || new Date().getTime() / 1000;

        this.spawnFork();

        this.disposed = false;
        this.userClose = false;

        this.userInput = false;

        this.setupStreams();
    }

    setupStreams() {
        this.pty.on(
            'data',
            getTermBufferer(
                `${this.id}${this.options.termType}${this.options.shellType || ''
                }`,
                this.onPtyData,
                true
            )
        );

        this.offBinaryData = this.term.onBinary(this.onBinaryData);

        this.pty.on('exit', (code) => {
            if (this.options.shellType === 'script') {
                return;
            }

            this.screen.terminalState(this, false);

            process.nextTick(() => {
                const end = new Date().getTime() / 1000;

                if (
                    (code === 0 && this.options.shellType !== 'repl') ||
                    (this.options.termType === 'program' &&
                        this.options.commandHasArgs)
                ) {
                    if (end - this.initTime < 5) {
                        this.inactiveOk = true;

                        this.termRender(null, true);

                        return;
                    }
                }

                if (code === 0 && !this.restarting && !this.screen.userClose) {
                    this.persisting = false;
                    this.destroy();
                }
            });
        });

        if (this.options.shellType === 'script') {
            this.pty.write(this.options.shellCommand);
            this.pty.write('\r');
        }

        setTimeout(
            () => {
                this.ready = true;

                const startup = () => {
                    this.muteStream.on('keypress', this.input);
                    this.stdin.on('data', this.muteWrite);

                    if (this.screen.focused === this) {
                        this.shellStdinToggle(true);
                    }

                    if (this.onReady) {
                        this.onReady(this);
                    }

                    this.active = true;

                    this.termRender(null, true);

                    if (this.options.termType === 'shell') {
                        this.onCommandLine = true;
                        this.shellProgram = false;
                    } else if (this.options.termType === 'program') {
                        this.onCommandLine = false;
                        this.shellProgram = true;
                    }
                };

                if (!this.pty) {
                    return;
                }

                if (this.writable) {
                    this.screen.terminalState(this, true);

                    if (!this.shellProgram && !this.onCommandLine) {
                        setTimeout(() => startup(), 1000);
                    } else {
                        startup();
                    }
                }
            },
            this.options.shellType === 'script' ? 0 : 300
        );
    }

    shellStdinOn() {
        if (this.writable) {
            if (this.options.cursorBlink && this.screen.focused === this) {
                this.cursorBlinking = true;
            }

            this.muteStream.unmute();
        }

        this.screen.ignoreLocked = [
            'S-left',
            'S-right',
            'S-up',
            'S-down',
            'S-home',
            'S-end',
            'M-left',
            'M-right',
            'M-up',
            'M-down',
            'C-left',
            'C-right',
            'up',
            'down',
            'home',
            'end',
            'M-x',
            'C-q',
            'escape'
        ];

        if (this.options.termType === 'shell') {
            [
                'pageup',
                'pagedown',
                'M-pageup',
                'M-pagedown',
                'S-pageup',
                'S-pagedown',
                'C-pageup',
                'C-pagedown',
                'escape'
            ].forEach((key) => this.screen.ignoreLocked.push(key));
        }


    }

    shellStdinOff() {
        if (this.options.cursorBlink) {
            this.cursorBlinking = false;
        }

        this.screen.ignoreLocked = [...this.screen.defIgnoreLocked];

        this.muteStream.mute();
    }

    shellStdinToggle(on = true) {
        if (on) {
            this.shellStdinOn();

        } else {
            this.shellStdinOff();
        }
    }

    get writable() {
        if (!this.options.pty || !this.term || !this.ready) {
            return false;
        }

        return (this.pty || { _writable: false })._writable;
    }

    checkControlExitSeq(key) {
        if (
            !this.destroyed &&
            ['C-q', 'C-c', 'C-d', 'C-z'].includes(key.full)
        ) {
            const CtrlQ = key.full === 'C-q';
            const CtrlC = key.full === 'C-c';
            const CtrlZ = key.full === 'C-z';


            if (CtrlQ) {
                this.screen.emit('close prompt');
                return false;
            }

            if (this.term && this.term.hasSelection() && CtrlC) {
                return false;
            }

            if (CtrlC) {
                if (
                    this.options.termType === 'program' ||
                    (this.options.shellType === 'repl' &&
                        this.lastKey === 'C-c')
                ) {
                    this.userClose = true;
                    this.persisting = false;
                }
                return true;
            }


            if (CtrlZ) {

                if (this.options.termType === 'program') {

                    this.userClose = true;
                    this.persisting = false;

                    this.pty.write('\u001b');


                    this.pty.write('\u0003');

                } else if (this.options.termType === 'shell') {
                    if (this.options.shellType === 'repl') {

                        this.userClose = true;
                        this.persisting = false;

                        this.pty.write('\u0003');
                        this.pty.write('.exit');
                        this.pty.write('\n');

                    } else if (this.shellProgram) {

                        this.pty.write('\u0003');
                        this.shellProgram = false;
                        return false;

                    } else if (this.onCommandLine) {

                        this.userClose = true;
                        this.persisting = false;

                        this.pty.write('\u0003');
                        this.pty.write('\nexit\n');

                        return false;

                    }
                }
            }
        }

        return true;
    }

    input(ch, key, data) {

        if (
            this.screen.focused !== this ||
            !this.writable ||
            !key ||
            TerminalShellType.isMouse(key.sequence, data) ||
            this.hidden ||
            this.popover ||
            this.promptOpen ||
            this.screen.exitOpen
        ) {
            return;
        }

        if (this.skipInputDataOnce) {
            this.skipInputDataOnce = false;
            return;
        }

        let full = key.full;

        const pagedownup = this.doKeyScroll(full, key)
            ? [
                'M-pagedown',
                'C-pagedown',
                'S-pagedown',
                'M-pageup',
                'C-pageup',
                'S-pageup',
                'pageup',
                'pagedown',
            ]
            : [];

        if (full) {
            if (
                [
                    'S-up',
                    'S-down',
                    'S-left',
                    'S-right',
                    'S-home',
                    'S-end',
                    'M-left',
                    'M-right',
                    'M-up',
                    'M-down',
                    'M-x',
                    'M-S-x',
                ].includes(full)
            ) {
                return;
            }

            if (this.panelGrid && full === 'escape') {
                return;
            }

            const more = this.checkControlExitSeq(key);

            this.lastKey = full;

            if (more) {
                this.clearSelection();

                if (!pagedownup.includes(full)) {
                    this.checkInput = 2;
                    this._lastScrollTo = null;

                    if (['\n', '\r', '\r\n'].includes(key.sequence)) {
                        this._returnPressed = true;
                    } else {
                        this._returnPressed = false;
                    }

                    if (this.options.termType !== 'program') {
                        this.setScrollPerc(100);
                    }

                    if (key.sequence) {
                        this.pty.write(key.sequence);
                    } else {
                        this.pty.write(ch);
                    }
                }



            }


        }
    }

    resizePty(delayed = false) {
        if (!this.options.pty) {
            return;
        }

        if (delayed === false && !this.cols) {
            setTimeout(() => this.resizePty(true));
            return;
        };


        if (this.cols > 0 && this.pty && this.writable) {
            this.pty.resize(this.cols, this.rows);

        }

    }

    updateInputLine(data) {
        if (this.term && this.options.termType === 'shell') {
            if (this.onCommandLine && this.commandLineLines.length) {
                const buffer = this.term.buffer.active;
                let line = '';
                if (this.commandLineLines[0] === this.commandLineLines[1]) {
                    line = buffer
                        .getLine(this.commandLineLines[0])
                        .translateToString(true);
                } else {
                    for (
                        let x = this.commandLineLines[0];
                        x <= this.commandLineLines[1];
                        x++
                    ) {
                        const bline = buffer.getLine(x);
                        if (bline) {
                            line += bline.translateToString(true) + '\n';
                        }
                    }
                }

                if (this.inputLine !== line) {
                    this.inputLine = line;
                }

                this.commandLineLines = [];

                this.inputAction(data ? data.toString() : '');
            }
        }
    }

    inputAction(data) {
        if (this.inputLine !== '') {
            let inputLine = stripAnsi(this.inputLine);

            let hasPrompt = false;
            let promptChar;

            if (inputLine.includes('>')) {
                promptChar = '>';
            } else if (inputLine.includes('#')) {
                promptChar = '#';
            } else if (inputLine.includes('$')) {
                promptChar = '$';
            }

            if (promptChar) {
                hasPrompt = true;
                inputLine = inputLine.substr(inputLine.indexOf(promptChar) + 1);
            }

            inputLine = inputLine.replace(/^( )+/g, '').replace(/( )+$/g, '');

            if (!inputLine.length || inputLine === '') {
                return;
            }

            data = stripAnsi(data);

            const entry =
                this._returnPressed &&
                (data.includes('\r') || data.includes('\n'));

            if (hasPrompt) {
                if (entry) {
                    this.lastCommand = '';
                    this.lastArguments = '';

                    if (
                        /yarn|pnpm|npm|apt|apk/.test(inputLine) &&
                        / add | install | i | del | unintall | remove | purge| rm | r | un | unlink /.test(
                            inputLine
                        )
                    ) {
                        this.lastInputLine = '';
                    } else {
                        this.lastInputLine = inputLine;
                    }

                    let parsed = inputLine
                        .replace(/\n/g, '')
                        .replace(/\r/g, '')
                        .trim();

                    let multichar;

                    if (inputLine.includes('&&')) {
                        multichar = '&&';
                    } else if (inputLine.includes(';')) {
                        multichar = ';';
                    }

                    if (multichar) {
                        const parts = inputLine.split(multichar);
                        parsed = parts[parts.length - 1].trim();
                    }

                    let command = '';
                    let args = '';

                    if (parsed.includes(' ')) {
                        const first = parsed.split(' ')[0];
                        command = first;
                        args = parsed.split(' ').slice(1).join(' ');
                    } else {
                        command = parsed;
                    }

                    for (const pkgMan of ['npm', 'yarn', 'apt', 'apk']) {
                        if (command.includes(pkgMan)) {
                            command = '';
                            args = '';
                        }
                    }

                    if (command !== '') {
                        this.lastCommand = command;
                    }

                    if (args !== '') {
                        this.lastArguments = args;
                    }

                    this.userInput = true;
                }

                for (const act of this.inputActions) {
                    let hasMatchesOne = false;
                    let matchesOne = false;
                    let matches = false;

                    const returned =
                        act.returned === undefined ? true : act.returned;

                    if (!returned || entry) {
                        if (act.matchOne) {
                            hasMatchesOne = true;

                            for (const m of act.matchOne) {
                                if (RegExp(m, 'gi').test(inputLine)) {
                                    matchesOne = true;
                                    break;
                                }
                            }
                        }

                        if (!hasMatchesOne || (hasMatchesOne && matchesOne)) {
                            if (act.match) {
                                if (
                                    RegExp(
                                        act.match,
                                        act.global ? 'gi' : 'i'
                                    ).test(inputLine)
                                ) {
                                    matches = true;
                                    act.fn(this, inputLine);
                                }
                            } else if (matchesOne) {
                                matches = true;
                            }
                        }

                        if (matches) {
                            act.fn(this, inputLine);
                        } else {
                            if (act.off) {
                                act.off(this);
                            }
                        }
                    }
                }
            }

            if (this._returnPressed) {
                setTimeout(() => {
                    this._returnPressed = false;
                });
            }
        }
    }

    disposeShell() {
        if (this.shell) {
            stopBuffering(
                `${this.id}${this.options.termType}${this.options.shellType || ''
                }`
            );

            this.muteStream.off('keypress', this.input);
            this.stdin.off('data', this.muteWrite);

            destroy(this.muteStream);

            this.screen.ignoreLocked = [...this.screen.defIgnoreLocked];

            if (this.offTermData) {
                this.offTermData.dispose();
                this.offTermData = null;
            }

            if (this.offBinaryData) {
                this.offBinaryData.dispose();
                this.offBinaryData = null;
            }

            if (this.pty) {
                this.pty.removeAllListeners('exit');
                this.pty.removeAllListeners('data');
                this.pty.kill();
                this.pty = null;
            }
        }
    }

    static isMouse(s, buf) {
        if (!buf) {
            if (Buffer.isBuffer(s)) {
                if (s[0] > 127 && s[1] === undefined) {
                    s[0] -= 128;
                    s = '\x1b' + s.toString('utf-8');
                } else {
                    s = s.toString('utf-8');
                }
            }
        }
        return (
            (buf && buf[0] === 0x1b && buf[1] === 0x5b && buf[2] === 0x4d) ||
            /\[M/g.test(s) ||
            /[\x1b\x07]\[M([\x00\u0020-\uffff]{3})/g.test(s) ||
            /[\x1b\x07]\[(\d+;\d+;\d+)M/g.test(s) ||
            /[\x1b\x07]\[<(\d+;\d+;\d+)([mM])/g.test(s) ||
            /[\x1b\x07]\[<(\d+;\d+;\d+;\d+)&w/g.test(s) ||
            /[\x1b\x07]\[24([0135])~\[(\d+),(\d+)\]\r/g.test(s) ||
            /[\x1b\x07]\[(O|I)/g.test(s)
        );
    }
}

module.exports = TerminalShellType;
