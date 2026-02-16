/**
 * Constantes principales du jeu de Whist Ascendant
 */

const SUITS = ['♥', '♦', '♣', '♠'];
const VALUES = ['7', '8', '9', '10', 'V', 'D', 'R', 'A'];

const POWER_NORMAL = {
    '7': 7, '8': 8, '9': 9, 'V': 10, 'D': 11, 'R': 12, '10': 13, 'A': 14
};

const POWER_TRUMP = {
    '7': 7, '8': 8, 'D': 9, 'R': 10, '10': 11, 'A': 12, '9': 13, 'V': 14
};

const SCORING = {
    BONUS_BASE: 10,
    PER_TRICK: 2,
    PENALTY_PER_DIFF: 2
};

module.exports = {
    SUITS,
    VALUES,
    POWER_NORMAL,
    POWER_TRUMP,
    SCORING
};
