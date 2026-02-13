module.exports = {
    // Les 4 couleurs
    SUITS: ['♥', '♦', '♣', '♠'],

    // On définit les étiquettes des cartes (Utilisons V, D, R, A pour le style français)
    VALUES: ['7', '8', '9', '10', 'V', 'D', 'R', 'A'],

    /**
     * Puissance en couleur normale
     * Hiérarchie : 7 < 8 < 9 < Valet < Dame < Roi < 10 < As
     */
    POWER_NORMAL: {
        '7': 7, '8': 8, '9': 9, 'V': 10, 'D': 11, 'R': 12, '10': 13, 'A': 14
    },

    /**
     * Puissance à l'Atout (Inspirée de la Belote)
     * Hiérarchie : 7 < 8 < Dame < Roi < 10 < As < 9 < Valet
     */
    POWER_TRUMP: {
        '7': 7, '8': 8, 'D': 9, 'R': 10, '10': 11, 'A': 12, '9': 13, 'V': 14
    },

    /**
     * Ton barème de points resserré
     */
    SCORING: {
        BONUS_BASE: 10,       // Fixe pour la réussite du contrat
        PER_TRICK: 2,        // 2 points par pli fait
        PENALTY_PER_DIFF: 2  // -2 points par pli d'écart
    }
};