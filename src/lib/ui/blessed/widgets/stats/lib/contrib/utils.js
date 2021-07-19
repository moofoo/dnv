exports.arrayMax = function (array, iteratee) {
    let index = -1;
    let length = array.length;

    let computed, result;
    while (++index < length) {
        let value = array[index];
        let current = iteratee(value);

        if (
            current != null &&
            (computed === undefined ? current === current : current > computed)
        ) {
            (computed = current), (result = value);
        }
    }
    return result;
};
