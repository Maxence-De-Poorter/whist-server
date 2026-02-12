/**
 * @file constants.js
 * @description Définit toutes les constantes du jeu de cartes (couleurs, valeurs, puissances et barème de points)
 */

'use strict';

/** Couleurs disponibles (suits) */
const SUITS = Object.freeze(['♥', '♦', '♣', '♠']);

/** Valeurs de cartes disponibles (style français) */
const VALUES = Object.freeze(['7', '8', '9', '10', 'V', 'D', 'R', 'A']);

/**
 * Puissance en couleur normale
 * Hiérarchie : 7 < 8 < 9 < Valet < Dame < Roi < 10 < As
 */
const POWER_NORMAL = Object.freeze({
    '7': 7,
    '8': 8,
    '9': 9,
    'V': 10,
    'D': 11,
    'R': 12,
    '10': 13,
    'A': 14
});

/**
 * Puissance à l'atout (inspirée de la Belote)
 * Hiérarchie : 7 < 8 < Dame < Roi < 10 < As < 9 < Valet
 */
const POWER_TRUMP = Object.freeze({
    '7': 7,
    '8': 8,
    'D': 9,
    'R': 10,
    '10': 11,
    'A': 12,
    '9': 13,
    'V': 14
});

/**
 * Barème de points (resserré)
 */
const SCORING = Object.freeze({
    BONUS_BASE: 10,        // Bonus fixe pour la réussite du contrat
    PER_TRICK: 2,          // 2 points par pli réalisé
    PENALTY_PER_DIFF: 2    // -2 points par pli d'écart
});

module.exports = Object.freeze({
    SUITS,
    VALUES,
    POWER_NORMAL,
    POWER_TRUMP,
    SCORING
});
