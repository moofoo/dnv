const gradients = [
    ['cyan', 'red'],
    [
        '#323232',
        '#393939',
        '#494949',
        '#515151',
        '#595959',
        '#626262',
        '#6a6a6a',
        '#7b7b7b',
        '#848484',
        '#8d8d8d',
        '#969696',
        '#9f9f9f',
        '#b2b2b2',
        '#bbbbbb',
        '#cecece',
        '#d8d8d8',
        '#ffffff',
        '#ffffff',
        '#ffffff',
        '#d8d8d8',
        '#cecece',
        '#bbbbbb',
        '#b2b2b2',
        '#9f9f9f',
        '#969696',
        '#8d8d8d',
        '#848484',
        '#7b7b7b',
        '#6a6a6a',
        '#626262',
        '#595959',
        '#515151',
        '#494949',
        '#393939',
        '#323232',
    ],
    ['red', 'blue'],
    [
        '#004307',
        '#004d09',
        '#00570a',
        '#00610b',
        '#006b0c',
        '#00760d',
        '#00800e',
        '#008b0f',
        '#00960f',
        '#00a110',
        '#00ad10',
        '#00b80f',
        '#00c40e',
        '#00cf0d',
        '#00db0b',
        '#00ff00',
        '#00ff00',
        '#00ff00',
        '#00db0b',
        '#00cf0d',
        '#00c40e',
        '#00b80f',
        '#00ad10',
        '#00a110',
        '#00960f',
        '#008b0f',
        '#00800e',
        '#00760d',
        '#006b0c',
        '#00610b',
        '#00570a',
        '#004d09',
        '#004307',
    ],
    ['cyan', 'yellow'],
    [
        '#002d43',
        '#00344c',
        '#003b56',
        '#004260',
        '#004a6b',
        '#005175',
        '#005980',
        '#00608b',
        '#006896',
        '#0070a1',
        '#0078ac',
        '#0080b7',
        '#0088c3',
        '#0090cf',
        '#0098db',
        '#00b1ff',
        '#00b1ff',
        '#00b1ff',
        '#0098db',
        '#0090cf',
        '#0088c3',
        '#0080b7',
        '#0078ac',
        '#0070a1',
        '#006896',
        '#00608b',
        '#005980',
        '#005175',
        '#004a6b',
        '#004260',
        '#003b56',
        '#00344c',
        '#002d43',
    ],
    [
        '#430009',
        '#4d000d',
        '#580010',
        '#620012',
        '#6d0013',
        '#780014',
        '#830015',
        '#8e0016',
        '#990016',
        '#b00016',
        '#bb0015',
        '#c70014',
        '#ec0011',
        '#ff0000',
        '#ff0000',
        '#ff0000',
        '#ec0011',
        '#c70014',
        '#bb0015',
        '#b00016',
        '#990016',
        '#8e0016',
        '#830015',
        '#780014',
        '#6d0013',
        '#620012',
        '#580010',
        '#4d000d',
        '#430009',
    ],
    ['green', 'magenta'],
    [
        '#2d0443',
        '#34054d',
        '#3b0657',
        '#430761',
        '#4b076c',
        '#530876',
        '#5b0981',
        '#63098c',
        '#6c0a97',
        '#740aa2',
        '#7d0aad',
        '#8609b9',
        '#8f09c4',
        '#a803e6',
        '#be00ff',
        '#be00ff',
        '#be00ff',
        '#a803e6',
        '#8f09c4',
        '#8609b9',
        '#7d0aad',
        '#740aa2',
        '#6c0a97',
        '#63098c',
        '#5b0981',
        '#530876',
        '#4b076c',
        '#430761',
        '#3b0657',
        '#34054d',
        '#2d0443',
    ],
    ['green', 'blue'],
];

const twoTones = [
    ['#ffffff', '#8d8d8d'],
    ['cyan', 'red'],
    ['#00c37c', '#8d8d8d'],
    ['#00b1ff', '#003b56'],
    ['yellow', 'gray'],
    ['#00d411', '#003506'],
];

const fonts = ['block', 'simple3d', 'pallet', 'shade', 'grid', 'slick'];

let remainingGradients = [...gradients];
let remainingTwoTones = [...twoTones];
let remainingFonts = [...fonts];

const getOptions = (text) => {
    let font =
        remainingFonts.length === 1
            ? remainingFonts[0]
            : remainingFonts[Math.floor(Math.random() * remainingFonts.length)];

    remainingFonts = remainingFonts.filter((f) => f !== font);

    if (remainingFonts.length === 0) {
        remainingFonts = [...fonts];
    }

    let transitionGradient;
    let gradient;
    let colors;

    let twoColor = Math.random() > 0.5;

    if (font === 'simple3d') {
        twoColor = false;
    } else if (font === 'grid') {
        twoColor = true;
    }

    if (twoColor) {
        colors =
            remainingTwoTones.length === 1
                ? remainingTwoTones[0]
                : remainingTwoTones[
                      Math.floor(Math.random() * remainingTwoTones.length)
                  ];

        remainingTwoTones = remainingTwoTones.filter(
            (t) => t.toString() !== colors.toString()
        );

        if (remainingTwoTones.length === 0) {
            remainingTwoTones = [...twoTones];
        }
    } else {
        gradient =
            remainingGradients.length === 1
                ? remainingGradients[0]
                : remainingGradients[
                      Math.floor(Math.random() * remainingGradients.length)
                  ];

        colors = undefined;
        transitionGradient = gradient.length > 2;

        remainingGradients = remainingGradients.filter(
            (g) => g.toString() !== gradient.toString()
        );

        if (remainingGradients.length === 0) {
            remainingGradients = [...gradients];
        }
    }

    return {
        font,
        gradient,
        colors,
        transitionGradient,
    };
};

module.exports = {
    getOptions,
};
