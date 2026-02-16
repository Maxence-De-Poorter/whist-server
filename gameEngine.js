const {
    SUITS,
    VALUES,
    getCardPower,
    SCORING
} = require('./constants');

function isValidCard(card) {
    return (
        card &&
        typeof card.suit === 'string' &&
        typeof card.value === 'string' &&
        SUITS.includes(card.suit) &&
        VALUES.includes(card.value)
    );
}

module.exports = {

    /**
     * Nombre de cartes à distribuer selon le round (1 → 18)
     */
    getCardsCount(round) {
        if (!Number.isInteger(round) || round < 1 || round > 18) return 0;

        if (round <= 8) return round;
        if (round <= 10) return 8;
        return 18 - round + 1;
    },

    /**
     * Création + shuffle du deck
     */
    createDeck() {
        const deck = [];

        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({ suit, value });
            }
        }

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        return deck;
    },

    /**
     * Vérifie si un coup est légal
     */
    isMoveLegal(hand, card, table, trumpSuit) {
        if (!Array.isArray(hand) || !Array.isArray(table)) return false;
        if (!isValidCard(card)) return false;
        if (!hand.some(c => c.suit === card.suit && c.value === card.value)) return false;

        if (table.length === 0) return true;

        const leadSuit = table[0]?.card?.suit;
        if (!leadSuit) return false;

        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        // Obligation de fournir la couleur demandée
        if (hasLeadSuit) {
            return card.suit === leadSuit;
        }

        // Sinon obligation de couper si possible
        if (trumpSuit && SUITS.includes(trumpSuit)) {
            const hasTrump = hand.some(c => c.suit === trumpSuit);
            if (hasTrump) {
                return card.suit === trumpSuit;
            }
        }

        return true;
    },

    /**
     * Détermine le gagnant d'un pli
     * table = [{ playerId, card }]
     */
    evaluateTrick(table, trumpSuit) {
        if (!Array.isArray(table) || table.length === 0) return null;

        const leadSuit = table[0]?.card?.suit;
        if (!leadSuit) return null;

        let bestMove = table[0];

        for (let i = 1; i < table.length; i++) {
            const current = table[i];

            if (!isValidCard(current.card) || !isValidCard(bestMove.card)) continue;

            const currentSuit = current.card.suit;
            const bestSuit = bestMove.card.suit;

            const currentIsTrump = trumpSuit && currentSuit === trumpSuit;
            const bestIsTrump = trumpSuit && bestSuit === trumpSuit;

            // Cas 1 : un atout bat une non-atout
            if (currentIsTrump && !bestIsTrump) {
                bestMove = current;
                continue;
            }

            // Cas 2 : deux atouts → comparer puissance atout
            if (currentIsTrump && bestIsTrump) {
                if (
                    getCardPower(current.card.value, true) >
                    getCardPower(bestMove.card.value, true)
                ) {
                    bestMove = current;
                }
                continue;
            }

            // Cas 3 : aucun atout → comparer si même couleur que lead
            if (!bestIsTrump && currentSuit === leadSuit) {
                if (
                    getCardPower(current.card.value, false) >
                    getCardPower(bestMove.card.value, false)
                ) {
                    bestMove = current;
                }
            }
        }

        return bestMove;
    },

    /**
     * Calcul des points
     */
    calculatePoints(bid, tricksWon) {
        if (!Number.isInteger(bid) || !Number.isInteger(tricksWon)) return 0;

        const diff = Math.abs(bid - tricksWon);

        if (diff === 0) {
            return (
                SCORING.CONTRACT_SUCCESS_BONUS +
                tricksWon * SCORING.POINTS_PER_TRICK
            );
        }

        return -diff * SCORING.CONTRACT_FAIL_PENALTY_PER_TRICK;
    }
};
