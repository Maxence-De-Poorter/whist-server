/**
 * @file gameEngine.js
 * @description Moteur principal du jeu : gestion du paquet, des coups, des plis et du scoring.
 */

'use strict';

const {
    SUITS,
    VALUES,
    POWER_NORMAL,
    POWER_TRUMP,
    SCORING
} = require('./constants');

const gameEngine = Object.freeze({

    /**
     * Calcule le nombre de cartes à distribuer selon la manche.
     * Progression : 1→8, 8,8,8, puis 8→1 (total 18 manches).
     * @param {number} round - Numéro de la manche (1–18)
     * @returns {number} Nombre de cartes à distribuer
     */
    getCardsCount(round) {
        if (typeof round !== 'number' || round < 1 || round > 18) return 0;
        if (round <= 8) return round;
        if (round <= 11) return 8;
        return 18 - round + 1;
    },

    /**
     * Crée et mélange un paquet complet (32 cartes).
     * @returns {Array<{suit: string, value: string}>} Paquet mélangé
     */
    createDeck() {
        const deck = SUITS.flatMap(suit => VALUES.map(value => ({ suit, value })));

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        return deck;
    },

    /**
     * Vérifie si un coup est légal selon les règles du pli.
     * @param {Array<{suit: string, value: string}>} hand - Main du joueur
     * @param {{suit: string, value: string}} card - Carte jouée
     * @param {Array<{playerId: string, card: {suit: string, value: string}}>} table - Cartes déjà posées
     * @param {string} trumpSuit - Couleur d’atout ou "SA" (sans atout)
     * @returns {boolean} true si le coup est légal
     */
    isMoveLegal(hand, card, table, trumpSuit) {
        if (!Array.isArray(hand) || !card?.suit || !card?.value || !Array.isArray(table))
            return false;

        // Premier joueur → toujours légal
        if (table.length === 0) return true;

        const leadSuit = table[0]?.card?.suit;
        if (!leadSuit) return false;

        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        // 1️⃣ Fournir
        if (hasLeadSuit) return card.suit === leadSuit;

        // 2️⃣ Couper (si atout)
        if (trumpSuit && trumpSuit !== 'SA') {
            const hasTrump = hand.some(c => c.suit === trumpSuit);
            if (hasTrump) return card.suit === trumpSuit;
        }

        // 3️⃣ Libre
        return true;
    },

    /**
     * Détermine le gagnant d’un pli.
     * @param {Array<{playerId: string, card: {suit: string, value: string}}>} table
     * @param {string} trumpSuit - Couleur d’atout ou "SA"
     * @returns {{playerId: string, card: object} | null} Le mouvement gagnant
     */
    evaluateTrick(table, trumpSuit) {
        if (!Array.isArray(table) || table.length === 0) return null;

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

            if (currentIsTrump && !bestIsTrump) {
                bestMove = current;
                continue;
            }

            if (currentIsTrump && bestIsTrump) {
                if ((POWER_TRUMP[current.card.value] ?? -1) > (POWER_TRUMP[bestMove.card.value] ?? -1))
                    bestMove = current;
                continue;
            }

            if (!bestIsTrump && currentSuit === leadSuit) {
                if ((POWER_NORMAL[current.card.value] ?? -1) > (POWER_NORMAL[bestMove.card.value] ?? -1))
                    bestMove = current;
            }
        }

        return bestMove;
    },

    /**
     * Calcule les points d’un joueur selon son pari et ses plis gagnés.
     * @param {number} bid - Pari annoncé
     * @param {number} tricksWon - Nombre de plis remportés
     * @returns {number} Score
     */
    calculatePoints(bid, tricksWon) {
        if (typeof bid !== 'number' || typeof tricksWon !== 'number') return 0;

        const diff = Math.abs(bid - tricksWon);
        const { BONUS_BASE, PER_TRICK, PENALTY_PER_DIFF } = SCORING;

        if (diff === 0)
            return BONUS_BASE + tricksWon * PER_TRICK;

        return -diff * PENALTY_PER_DIFF;
    },

    /**
     * Détermine la valeur de pari interdite (règle “on ne peut pas tomber juste”).
     * @param {number} nbCards - Nombre de cartes distribuées
     * @param {number[]} currentBids - Liste des paris actuels
     * @returns {number|null} Valeur de pari interdite ou null si aucune
     */
    getForbiddenBid(nbCards, currentBids) {
        if (typeof nbCards !== 'number' || !Array.isArray(currentBids)) return null;

        const totalBids = currentBids.reduce((sum, bid) => sum + (typeof bid === 'number' ? bid : 0), 0);
        const forbidden = nbCards - totalBids;

        return (forbidden >= 0 && forbidden <= nbCards) ? forbidden : null;
    }
});

module.exports = gameEngine;
