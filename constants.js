/**
 * Constantes principales du jeu de Whist Ascendant
 */

const SUITS = Object.freeze(['♥', '♦', '♣', '♠']);
const VALUES = Object.freeze(['7', '8', '9', '10', 'V', 'D', 'R', 'A']);

const POWER_NORMAL = Object.freeze({
    '7': 7,
    '8': 8,
    '9': 9,
    'V': 10,
    'D': 11,
    'R': 12,
    '10': 13,
    'A': 14,
});

const POWER_TRUMP = Object.freeze({
    '7': 7,
    '8': 8,
    'D': 9,
    'R': 10,
    '10': 11,
    'A': 12,
    '9': 13,
    'V': 14,
});

const SCORING = Object.freeze({
    CONTRACT_SUCCESS_BONUS: 10,
    POINTS_PER_TRICK: 2,
    CONTRACT_FAIL_PENALTY_PER_TRICK: 2,
});

/**
 * Renvoie la puissance d'une carte selon si elle est à l'atout ou non.
 * @param {string} value - valeur ('7','8','9','10','V','D','R','A')
 * @param {boolean} isTrump
 * @returns {number}
 */
function getCardPower(value, isTrump) {
    const power = isTrump ? POWER_TRUMP[value] : POWER_NORMAL[value];
    if (typeof power !== 'number') {
        throw new Error(`Invalid card value "${value}" for power map`);
    }
    return power;
}

/**
 * Vérifie la cohérence interne des constantes au chargement.
 */
function assertConstantsIntegrity() {
    for (const v of VALUES) {
        if (typeof POWER_NORMAL[v] !== 'number') {
            throw new Error(`Missing POWER_NORMAL for value "${v}"`);
        }
        if (typeof POWER_TRUMP[v] !== 'number') {
            throw new Error(`Missing POWER_TRUMP for value "${v}"`);
        }
    }
}

assertConstantsIntegrity();

module.exports = {
    SUITS,
    VALUES,
    POWER_NORMAL,
    POWER_TRUMP,
    SCORING,
    getCardPower,
};
