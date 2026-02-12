const {
    SUITS,
    VALUES,
    POWER_NORMAL,
    POWER_TRUMP,
    SCORING
} = require('./constants');

module.exports = {

    /**
     * Progression des cartes : 1→8, 8,8,8 puis 8→1
     */
    getCardsCount: (round) => {
        if (typeof round !== 'number' || round < 1 || round > 18) {
            return 0;
        }

        if (round <= 8) return round;
        if (round <= 11) return 8;
        return 18 - round + 1;
    },

    /**
     * Création + shuffle Fisher-Yates
     */
    createDeck: () => {
        const deck = [];

        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({ suit, value });
            }
        }

        // Fisher-Yates sécurisé
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        return deck;
    },

    /**
     * Vérifie si un coup est légal
     */
    isMoveLegal: (hand, card, table, trumpSuit) => {

        if (!Array.isArray(hand) ||
            !card ||
            !card.suit ||
            !card.value ||
            !Array.isArray(table)
        ) {
            return false;
        }

        // Premier joueur → toujours légal
        if (table.length === 0) return true;

        const leadSuit = table[0]?.card?.suit;
        if (!leadSuit) return false;

        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        // 1️⃣ Fournir
        if (hasLeadSuit) {
            return card.suit === leadSuit;
        }

        // 2️⃣ Couper (si atout et pas SA)
        if (trumpSuit && trumpSuit !== 'SA') {
            const hasTrump = hand.some(c => c.suit === trumpSuit);
            if (hasTrump) {
                return card.suit === trumpSuit;
            }
        }

        // 3️⃣ Libre
        return true;
    },

    /**
     * Détermine le gagnant du pli
     */
    evaluateTrick: (table, trumpSuit) => {

        if (!Array.isArray(table) || table.length === 0) {
            return null;
        }

        const leadSuit = table[0]?.card?.suit;
        if (!leadSuit) return null;

        let bestMove = table[0];

        for (let i = 1; i < table.length; i++) {

            const current = table[i];
            if (!current?.card) continue;

            const currentSuit = current.card.suit;
            const bestSuit = bestMove.card.suit;

            const currentIsTrump = trumpSuit !== 'SA' && currentSuit === trumpSuit;
            const bestIsTrump = trumpSuit !== 'SA' && bestSuit === trumpSuit;

            // Atout bat non-atout
            if (currentIsTrump && !bestIsTrump) {
                bestMove = current;
                continue;
            }

            // Atout vs atout
            if (currentIsTrump && bestIsTrump) {
                const currentPower = POWER_TRUMP[current.card.value] ?? -1;
                const bestPower = POWER_TRUMP[bestMove.card.value] ?? -1;

                if (currentPower > bestPower) {
                    bestMove = current;
                }
                continue;
            }

            // Même couleur que demandée
            if (!bestIsTrump && currentSuit === leadSuit) {
                const currentPower = POWER_NORMAL[current.card.value] ?? -1;
                const bestPower = POWER_NORMAL[bestMove.card.value] ?? -1;

                if (currentPower > bestPower) {
                    bestMove = current;
                }
            }
        }

        return bestMove;
    },

    /**
     * Calcul des points
     */
    calculatePoints: (bid, tricksWon) => {

        if (
            typeof bid !== 'number' ||
            typeof tricksWon !== 'number'
        ) {
            return 0;
        }

        const diff = Math.abs(bid - tricksWon);

        if (diff === 0) {
            return (
                (SCORING.BONUS_BASE ?? 0) +
                (tricksWon * (SCORING.PER_TRICK ?? 0))
            );
        }

        return -(diff * (SCORING.PENALTY_PER_DIFF ?? 0));
    },

    /**
     * Règle du pari interdit
     */
    getForbiddenBid: (nbCards, currentBids) => {

        if (
            typeof nbCards !== 'number' ||
            !Array.isArray(currentBids)
        ) {
            return null;
        }

        const currentSum = currentBids.reduce((a, b) => {
            return a + (typeof b === 'number' ? b : 0);
        }, 0);

        const forbiddenValue = nbCards - currentSum;

        if (
            forbiddenValue >= 0 &&
            forbiddenValue <= nbCards
        ) {
            return forbiddenValue;
        }

        return null;
    }
};
