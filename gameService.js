const Engine = require('./gameEngine');
const { isValidCard, isValidBid } = require('./validators');

/**
 * Lance un nouveau round
 */
function startNewRound(room, io) {
    if (!room || !room.gameState || !Array.isArray(room.players)) return;

    room.gameState.status = 'BIDDING';
    room.gameState.pendingTrickAcks = new Set();
    room.gameState.table = [];

    const nbCards = Engine.getCardsCount(room.gameState.currentRound);
    const deck = Engine.createDeck();

    room.players.forEach((p) => {
        p.hand = deck.splice(0, nbCards);
        p.bid = null;
        p.tricksWon = 0;

        io.to(p.id).emit('yourHand', p.hand);
    });

    room.gameState.trump = deck.length > 0 ? deck[0] : null;

    room.gameState.currentPlayerIndex =
        (room.gameState.dealerIndex + 1) % room.players.length;
}

/**
 * Gestion des paris
 */
function placeBid(room, socketId, bidValue) {
    if (!room?.gameState || room.gameState.status !== 'BIDDING') {
        return { ok: false };
    }

    const player = room.players[room.gameState.currentPlayerIndex];
    if (!player || player.id !== socketId) {
        return { ok: false };
    }

    const nbCards = Engine.getCardsCount(room.gameState.currentRound);

    if (!isValidBid(bidValue, nbCards)) {
        return { ok: false, error: 'Pari invalide.' };
    }

    player.bid = bidValue;

    room.gameState.currentPlayerIndex =
        (room.gameState.currentPlayerIndex + 1) % room.players.length;

    // Si tous les joueurs ont parié
    if (room.players.every((p) => p.bid !== null)) {
        room.gameState.status = 'PLAYING';
        room.gameState.currentPlayerIndex =
            (room.gameState.dealerIndex + 1) % room.players.length;
    }

    return { ok: true };
}

/**
 * Gestion d'un coup joué
 */
function playCard(room, socketId, card) {
    if (!room?.gameState || room.gameState.status !== 'PLAYING') {
        return { ok: false };
    }

    if (!Array.isArray(room.gameState.table)) {
        room.gameState.table = [];
    }

    if (room.gameState.table.length >= room.players.length) {
        return { ok: false };
    }

    const player = room.players[room.gameState.currentPlayerIndex];
    if (!player || player.id !== socketId) {
        return { ok: false };
    }

    if (!isValidCard(card)) {
        return { ok: false, error: 'Carte invalide.' };
    }

    const hasCard = player.hand.some(
        (c) => c.suit === card.suit && c.value === card.value
    );

    if (!hasCard) {
        return { ok: false, error: 'Carte invalide.' };
    }

    const trumpSuit = room.gameState.trump?.suit || null;

    if (
        !Engine.isMoveLegal(
            player.hand,
            card,
            room.gameState.table,
            trumpSuit
        )
    ) {
        return { ok: false, error: 'Coup illégal !' };
    }

    // Ajouter carte au pli
    room.gameState.table.push({
        playerId: player.userId,
        playerName: player.name,
        card
    });

    // Retirer carte de la main
    player.hand = player.hand.filter(
        (c) => !(c.suit === card.suit && c.value === card.value)
    );

    // Si le pli est complet
    if (room.gameState.table.length === room.players.length) {
        const winnerMove = Engine.evaluateTrick(
            room.gameState.table,
            trumpSuit
        );

        if (!winnerMove) {
            return { ok: false };
        }

        const winner = room.players.find(
            (p) => p.userId === winnerMove.playerId
        );

        if (!winner) {
            return { ok: false };
        }

        winner.tricksWon++;

        room.gameState.currentPlayerIndex =
            room.players.indexOf(winner);

        const isRoundOver = room.players.every(
            (p) => p.hand.length === 0
        );

        const completedTable = [...room.gameState.table];

        // Reset table pour le prochain pli
        room.gameState.table = [];

        return {
            ok: true,
            trickCompleted: true,
            winnerName: winner.name,
            table: completedTable,
            roundOver: isRoundOver
        };
    }

    // Sinon on passe au joueur suivant
    room.gameState.currentPlayerIndex =
        (room.gameState.currentPlayerIndex + 1) %
        room.players.length;

    return { ok: true };
}

/**
 * Fin d'un round
 */
function finishRound(room) {
    if (!room?.gameState) return { ok: false };

    const roundResult = {
        round: room.gameState.currentRound,
        results: room.players.map((p) => {
            const points = Engine.calculatePoints(
                p.bid,
                p.tricksWon
            );

            p.score += points;

            return {
                playerName: p.name,
                bid: p.bid,
                tricksWon: p.tricksWon,
                points,
                total: p.score
            };
        })
    };

    room.gameState.scoreHistory.push(roundResult);

    room.gameState.currentRound++;
    room.gameState.dealerIndex =
        (room.gameState.dealerIndex + 1) % room.players.length;

    if (room.gameState.currentRound > 18) {
        room.gameState.status = 'FINISHED';
        return { gameOver: true };
    }

    return { nextRound: true };
}

module.exports = {
    startNewRound,
    placeBid,
    playCard,
    finishRound
};
