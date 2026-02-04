const { SUITS, VALUES, POWER_NORMAL, POWER_TRUMP, SCORING } = require('./constants');

module.exports = {
    /**
     * Progression des cartes : 1->8, puis trois rounds de 8, puis 8->1
     */
    getCardsCount: (round) => {
        if (round <= 8) return round;
        if (round <= 11) return 8;
        return 18 - round + 1;
    },

    /**
     * Mélange de Fisher-Yates pour une distribution 100% équitable
     */
    createDeck: () => {
        let deck = [];
        SUITS.forEach(s => VALUES.forEach(v => deck.push({ suit: s, value: v })));

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    },

    /**
     * RÈGLE STRICTE : Fournir ou Couper.
     * 1. Si on a la couleur demandée -> Obligation de la jouer.
     * 2. Sinon, si on a de l'atout -> Obligation de couper.
     * 3. Sinon -> On peut "pisser" (se défausser).
     */
    isMoveLegal: (hand, card, table, trumpSuit) => {
        if (table.length === 0) return true;

        const leadSuit = table[0].card.suit;
        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        // Règle 1 : Fournir la couleur
        if (hasLeadSuit) {
            return card.suit === leadSuit;
        }

        // Règle 2 : Couper obligatoirement si pas de couleur
        const hasTrump = hand.some(c => c.suit === trumpSuit);
        if (hasTrump && trumpSuit !== 'SA') { // 'SA' = Sans Atout
            return card.suit === trumpSuit;
        }

        // Règle 3 : Pas de couleur ni d'atout -> Libre
        return true;
    },

    /**
     * Détermine le vainqueur du pli
     */
    evaluateTrick: (table, trumpSuit) => {
        const leadSuit = table[0].card.suit;
        let bestMove = table[0];

        for (let i = 1; i < table.length; i++) {
            const current = table[i];
            const currentIsTrump = current.card.suit === trumpSuit;
            const bestIsTrump = bestMove.card.suit === trumpSuit;

            if (currentIsTrump && !bestIsTrump) {
                bestMove = current;
            } else if (currentIsTrump && bestIsTrump) {
                if (POWER_TRUMP[current.card.value] > POWER_TRUMP[bestMove.card.value]) {
                    bestMove = current;
                }
            } else if (current.card.suit === leadSuit && !bestIsTrump) {
                if (POWER_NORMAL[current.card.value] > POWER_NORMAL[bestMove.card.value]) {
                    bestMove = current;
                }
            }
        }
        return bestMove;
    },

    /**
     * Calcul des points avec LaTeX pour la précision formelle :
     * Si $diff = 0$ : $Points = Bonus + (Plis \times 10)$
     * Si $diff \neq 0$ : $Points = -(diff \times 10)$
     */
    calculatePoints: (bid, tricksWon) => {
        const diff = Math.abs(bid - tricksWon);
        if (diff === 0) {
            return SCORING.BONUS_BASE + (tricksWon * SCORING.PER_TRICK);
        } else {
            return -(diff * SCORING.PENALTY_PER_DIFF);
        }
    },

    /**
     * RÈGLE DU PARI INTERDIT :
     * Appliquée à CHAQUE joueur. La somme totale ne doit jamais être égale au nombre de plis.
     */
    getForbiddenBid: (nbCards, currentBids) => {
        const currentSum = currentBids.reduce((a, b) => a + (b || 0), 0);
        const forbiddenValue = nbCards - currentSum;

        // Si le chiffre nécessaire pour égaliser est possible, on l'interdit
        if (forbiddenValue >= 0 && forbiddenValue <= nbCards) {
            return forbiddenValue;
        }
        return null;
    }
};