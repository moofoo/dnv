const destroy = require('destroy');

const execa = require('execa');
const debounce = require('lodash.debounce');
const scrollBackStream = require('../util/scrollback-stream');

const parseCommand = require('../util/parse-command');
const {
    getTermBufferer,
    stopBuffering,
} = require('../util/terminal-buffering');

class TerminalProcessType {
    initializer(options) {
        if (options.termType === 'process') {
            options.lineState = {
                unseenLine: function (line, lineState) {
                    if (
                        !this.parent ||
                        this.lineCount < this.rows ||
                        (!this.hidden && this.getScrollPerc() === 100) ||
                        lineState.unseenProblem
                    ) {
                        return false;
                    }

                    return this.hidden || this.getScrollPerc() < 100;
                }.bind(this),
                unseenProblem: function (line, lineState) {
                    if (
                        !this.parent ||
                        this.lineCount < this.rows ||
                        (!this.hidden && this.getScrollPerc() === 100)
                    ) {
                        return false;
                    }

                    if (this.hidden || this.getScrollPerc() < 100) {
                        if (
                            lineState.unseenProblem ||
                            /warning/gi.test(line) ||
                            /error/gi.test(line)
                        ) {
                            return true;
                        }
                    }
                }.bind(this),
                ...(options.lineState || {}),
            };

            this.streamOpen = false;
            this.bindit(['onData', 'onClose']);
            this.startScrollPerc = 100;

            if (!options.lineState.active) {
                this.inactiveOk = true;
            }

            this.on('line state', () => {
                if (this.lineState.active && !this.streamOpen) {
                    this.execCommand();
                }
            });

            this.on(
                'scroll',
                debounce(
                    () => {
                        const scrollPerc = this.getScrollPerc();
                        const oldUnseenLine = this.lineState.unseenLine;
                        const oldUnseenProblem = this.lineState.unseenProblem;

                        if (scrollPerc === 100) {
                            this.lineState.unseenLine = false;
                            this.lineState.unseenProblem = false;
                        }

                        if (
                            oldUnseenLine !== this.lineState.unseenLine ||
                            oldUnseenProblem !== this.lineState.unseenProblem
                        ) {
                            this.lineStateChange();
                        }
                    },
                    100,
                    { trailing: true }
                )
            );

            this.on('clear', () => {
                const oldUnseenLine = this.lineState.unseenLine;
                const oldUnseenProblem = this.lineState.unseenProblem;

                this.lineState.unseenLine = false;
                this.lineState.unseenProblem = false;

                if (
                    oldUnseenLine !== this.lineState.unseenLine ||
                    oldUnseenProblem !== this.lineState.unseenProblem
                ) {
                    this.lineStateChange();
                }
            });
        }
    }

    getCommandStream(cmd) {
        this.subprocess = execa(...parseCommand(cmd), {
            all: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        if (!this.startingUp) {
            this.ready = true;
            this.screen.terminalState(this, true);
        }

        return this.subprocess.all;
    }

    startUp(command) {
        return new Promise(async (resolve) => {
            const lines = await scrollBackStream.array(
                this.getCommandStream(command),
                {
                    scrollback: this.options.scrollback || 1000,
                }
            );

            this.clear({ firstLine: true });

            this.streamOpen = true;

            this.write(lines.join('\n') + '\n', () => {
                this.startingUp = false;
                this.skipData = false;
                this.ready = true;

                if (this.onReady) {
                    this.onReady(this);
                }

                this.screen.terminalState(this, true);

                if (this.execStream) {
                    this.execStream.resume();
                }

                this.setScrollPerc(100);

                this.execStream.on(
                    'data',
                    getTermBufferer(`${this.id}'process`, this.onData)
                );

                this.execStream.on('close', this.onClose);

                resolve();
            });
        });
    }

    execCommand(cmd) {
        let { command } = this.options;

        if (cmd) {
            command = cmd;
        }

        if (this.execStream) {
            this.execStream.removeAllListeners('data');
            this.execStream.removeAllListeners('close');
            this.execStream.end();
            this.streamOpen = false;
        }

        let execComm = command;

        if (typeof command === 'object') {
            if (command.prep && !this.execStream) {
                this.startingUp = true;
                this.streamOpen = true;

                this.write('Loading logs...');

                (async () => {
                    await this.startUp(command.prep);
                })();
            }

            if (this.execStream && !this.streamOpen) {
                execComm = command.restart;
            } else {
                execComm = command.start;
            }
        }

        if (typeof execComm === 'function') {
            execComm = execComm();
        }

        this.execStream = this.getCommandStream(execComm);

        this.execStream.removeAllListeners('data');
        this.execStream.removeAllListeners('close');

        if (this.startingUp) {
            this.execStream.pause();
        } else {
            this.execStream.on('data', getTermBufferer(this.id, this.onData));
            this.execStream.on('close', this.onClose);
        }
    }

    onData(data) {
        if (!this.startingUp) {
            this.write(data);
        }
    }

    onClose() {
        this.screen.terminalState(this, false);
        this.streamOpen = false;
    }

    disposeProcess() {
        if (this.execStream) {
            stopBuffering(`${this.id}'process`);
            this.execStream.end();
            destroy(this.execStream);
            this.execStream = null;
            if (this.subprocess) {
                this.subprocess.kill();
                this.subprocess = null;
            }
        }
    }
}

module.exports = TerminalProcessType;
