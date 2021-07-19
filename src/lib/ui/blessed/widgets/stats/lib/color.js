const getColor = (() => {
    let colors = ['cyan', 'red', 'green', 'yellow', 'magenta'];

    const selectedColors = {};

    let remainingColors = [];

    let lastColor = [];

    return (id) => {
        if (selectedColors[id]) {
            return selectedColors[id];
        }

        if (remainingColors.length <= 2) {
            remainingColors = [...colors];
        }

        let color = remainingColors[Math.floor(Math.random() * remainingColors.length)];

        while (!color || lastColor.includes(color)) {
            color = remainingColors[Math.floor(Math.random() * remainingColors.length)];
        }

        lastColor.push(color);

        if (lastColor.length >= 2) {
            lastColor.pop();
        }

        remainingColors = remainingColors.filter((col) => {
            return col !== color;
        });

        selectedColors[id] = color;

        return selectedColors[id];
    };
})();

module.exports = getColor;
