const {
    POWER_NORMAL,
    POWER_TRUMP,
    SCORING
} = require('./constants');

module.exports = {

    getCardsCount: (round) => {
        if (typeof round !== 'number' || round < 1 || round > 18) return 0;
        if (round <= 8) return round;
        if (round <= 10) return 8;
        return 18 - round + 1;
    },

    createDeck: () => {
        const { SUITS, VALUES } = require('./constants');
        const deck = [];

        for (const suit of SUITS)
            for (const value of VALUES)
                deck.push({ suit, value });

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        return deck;
    },

    isMoveLegal: (hand, card, table, trumpSuit) => {
        if (!Array.isArray(hand) || !card?.suit || !card?.value) return false;
        if (table.length === 0) return true;

        const leadSuit = table[0]?.card?.suit;
        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        if (hasLeadSuit) return card.suit === leadSuit;

        if (trumpSuit) {
            const hasTrump = hand.some(c => c.suit === trumpSuit);
            if (hasTrump) return card.suit === trumpSuit;
        }

        return true;
    },

    evaluateTrick: (table, trumpSuit) => {
        if (!Array.isArray(table) || table.length === 0) return null;

        const leadSuit = table[0]?.card?.suit;
        let bestMove = table[0];

        for (let i = 1; i < table.length; i++) {
            const current = table[i];

            const currentSuit = current.card.suit;
            const bestSuit = bestMove.card.suit;

            const currentIsTrump = trumpSuit && currentSuit === trumpSuit;
            const bestIsTrump = trumpSuit && bestSuit === trumpSuit;

            if (currentIsTrump && !bestIsTrump) {
                bestMove = current;
                continue;
            }

            if (currentIsTrump && bestIsTrump) {
                if (POWER_TRUMP[current.card.value] > POWER_TRUMP[bestMove.card.value])
                    bestMove = current;
                continue;
            }

            if (!bestIsTrump && currentSuit === leadSuit) {
                if (POWER_NORMAL[current.card.value] > POWER_NORMAL[bestMove.card.value])
                    bestMove = current;
            }
        }

        return bestMove;
    },

    calculatePoints: (bid, tricksWon) => {
        const diff = Math.abs(bid - tricksWon);

        if (diff === 0)
            return SCORING.BONUS_BASE + tricksWon * SCORING.PER_TRICK;

        return -diff * SCORING.PENALTY_PER_DIFF;
    }
};
