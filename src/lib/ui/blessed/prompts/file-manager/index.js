const blessed = require('blessed');
const Tree = require('./tree');
const fs = require('fs');

var explorer = (path, debug) => ({
    name: '/',
    extended: true,
    // Custom function used to recursively determine the node path
    getPath: function (self) {
        // If we don't have any parent, we are at tree root, so return the base case
        if (!self.parent) return path;
        // Get the parent node path and add this node name
        return self.parent.getPath(self.parent) + '/' + self.name;
    },
    // Child generation function
    children: function (self) {
        var result = {};
        var selfPath = self.getPath(self);

        try {
            // List files in this directory
            var children = fs.readdirSync(
                selfPath === path ? selfPath : selfPath + '/'
            );

            children = children.filter((child) => {
                var completePath = selfPath + '/' + child;
                if (fs.lstatSync(completePath).isDirectory()) {
                    if (child.includes('node_modules')) {
                        return false;
                    } else {
                        return true;
                    }
                } else {
                    if (
                        child.charAt(0) !== '.' &&
                        !child.includes('.json') &&
                        (child.includes('.js') || child.includes('.ts'))
                    ) {
                        return true;
                    }
                }

                return false;
            });

            // childrenContent is a property filled with self.children() result
            // on tree generation (tree.setData() call)
            if (!self.childrenContent) {
                for (var child in children) {
                    child = children[child];
                    var completePath = selfPath + '/' + child;
                    if (fs.lstatSync(completePath).isDirectory()) {
                        // If it's a directory we generate the child with the children generation function
                        result[child] = {
                            completePath,
                            relativePath: completePath.replace(path + '/', ''),
                            directory: true,
                            name: child,
                            getPath: self.getPath,
                            extended: false,
                            children: self.children,
                        };
                    } else {
                        // Otherwise children is not set (you can also set it to "{}" or "null" if you want)
                        result[child] = {
                            completePath,
                            relativePath: completePath.replace(path + '/', ''),
                            name: child,
                            getPath: self.getPath,
                            extended: false,
                            directory: false,
                        };
                    }
                }
            } else {
                result = self.childrenContent;
            }
        } catch (e) {
            result = e;
        }
        return result;
    },
});

class Manager extends blessed.Box {
    constructor(opts) {
        const options = {
            ...opts,
            top: 1,
            left: 'center',
            width: '75%',
            height: '90%',
        };

        super(options);

        this.action = this.options.action;

        this.subPanel = this.options.subPanel;

        this.onMouseUp = this.onMouseUp.bind(this);

        this.initManager();
    }

    get type() {
        return 'prompt';
    }

    onMouseUp(data) {
        let x = 0;

        for (const item of this.tree.rows.items) {
            let pos;
            try {
                pos = item._getPos();
            } catch {}

            if (pos) {
                if (data.y === pos.yi) {
                    if (this.tree.nodeLines[x]) {
                        this.tree.emit('select', this.tree.nodeLines[x], x);
                    }
                }
            }

            x++;
        }
    }

    initManager() {
        const screen = this.screen;
        const subPanel = this.subPanel;

        subPanel.popover = true;

        //screen.grabMouse = true;
        screen.promptOpen = true;
        subPanel.popoverCoords = this._getCoords(true);

        screen.render();

        this.on('destroy', () => {
            this.screen.off('mouseup', this.onMouseUp);

            subPanel.popover = false;
            subPanel.focus();

            screen.render();

            process.nextTick(() => {
                screen.options.checkScrollable = false;
                //   screen.grabMouse = false;
                screen.promptOpen = false;
                screen.render();
            });
        });

        this.tree = new Tree({
            screen: this.screen,
            debug: this.options.debug,
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            template: { lines: true },
            input: true,
            scrollable: true,
        });

        this.tree.setData(explorer(this.options.path, this.options.debug));

        this.tree.focus();

        this.tree.rows.select(1);

        this.screen.render();

        process.nextTick(() => {
            this.screen.on('mouseup', this.onMouseUp);

            this.tree.rows.key('escape', () => {
                //    this.tree.rows.grabMouse = false;
                //     this.screen.grabMouse = false;
                this.destroy();
            });

            this.tree.on('select', async (node) => {
                await this.action(node);
                //    this.tree.rows.grabMouse = false;
                //    this.screen.grabMouse = false;

                this.destroy();
            });
        });
    }
}

module.exports = Manager;
