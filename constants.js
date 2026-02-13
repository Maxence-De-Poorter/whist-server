/**
 * Constantes principales du jeu de Whist Ascendant
 * Version optimisée et cohérente avec le moteur de jeu
 */
module.exports = {
    // Les 4 couleurs (symboles français)
    SUITS: ['♥', '♦', '♣', '♠'],

    // Étiquettes de cartes (françaises)
    VALUES: ['7', '8', '9', '10', 'V', 'D', 'R', 'A'],

    /**
     * Puissance en couleur normale
     * Hiérarchie : 7 < 8 < 9 < Valet < Dame < Roi < 10 < As
     */
    POWER_NORMAL: {
        '7': 7, '8': 8, '9': 9, 'V': 10, 'D': 11, 'R': 12, '10': 13, 'A': 14
    },

    /**
     * Puissance à l'Atout (inspirée de la Belote)
     * Hiérarchie : 7 < 8 < Dame < Roi < 10 < As < 9 < Valet
     * → Le Valet et le 9 deviennent très forts
     */
    POWER_TRUMP: {
        '7': 7, '8': 8, 'D': 9, 'R': 10, '10': 11, 'A': 12, '9': 13, 'V': 14
    },

    /**
     * Barème des points :
     * - Si le joueur réussit son pari : 10 + (2 × nb de plis faits)
     * - Sinon : -2 points par pli d’écart
     */
    SCORING: {
        BONUS_BASE: 10,       // Points fixes si contrat réussi
        PER_TRICK: 2,         // Points par pli gagné
        PENALTY_PER_DIFF: 2   // Points perdus par pli d'écart
    }
};

// --- Validation interne (optionnelle, utile en dev) ---
for (const value of module.exports.VALUES) {
    if (module.exports.POWER_NORMAL[value] === undefined) {
        console.warn(`⚠️ POWER_NORMAL manquant pour ${value}`);
    }
    if (module.exports.POWER_TRUMP[value] === undefined) {
        console.warn(`⚠️ POWER_TRUMP manquant pour ${value}`);
    }
}
