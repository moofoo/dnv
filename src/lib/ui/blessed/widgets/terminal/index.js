const aggregation = require('aggregation/es6');

const Base = require('./base');

const Events = require('./method-mixins/events');
const Resizing = require('./method-mixins/resizing');
const Writing = require('./method-mixins/writing');
const RenderingAndBuffer = require('./method-mixins/rendering-buffer');
const DimensionsAndScrolling = require('./method-mixins/dimensions-scroll');
const LineState = require('./method-mixins/line-state');

const PromptBase = require('./prompt-mixins/prompt-base');
const CopyPrompt = require('./prompt-mixins/copy-prompt');
const SearchPrompt = require('./prompt-mixins/search-prompt');
const FilterPrompt = require('./prompt-mixins/filter-prompt');

const TerminalShellType = require('./type-mixins/shell');
const TerminalProcessType = require('./type-mixins/process');
const TerminalMarkdownType = require('./type-mixins/markdown');

const BaseTerm = aggregation(
    Base,
    RenderingAndBuffer,
    Events,
    Resizing,
    Writing,
    DimensionsAndScrolling,
    LineState
);

const ProgramTerminal = aggregation(
    BaseTerm,
    TerminalShellType,
    PromptBase,
    CopyPrompt
);

const ShellTerminal = aggregation(
    BaseTerm,
    TerminalShellType,
    PromptBase,
    SearchPrompt,
    CopyPrompt
);

const LogTerminal = aggregation(
    BaseTerm,
    TerminalProcessType,
    PromptBase,
    SearchPrompt,
    FilterPrompt,
    CopyPrompt
);

const ScriptTerminal = aggregation(
    BaseTerm,
    TerminalProcessType,
    PromptBase,
    SearchPrompt,
    CopyPrompt
);

const MarkdownTerminal = aggregation(
    BaseTerm,
    TerminalMarkdownType,
    PromptBase,
    SearchPrompt,
    CopyPrompt
);

module.exports = {
    BaseTerm,
    ProgramTerminal,
    ShellTerminal,
    LogTerminal,
    MarkdownTerminal,
    ScriptTerminal,
};
