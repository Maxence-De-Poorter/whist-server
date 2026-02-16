const Engine = require('./gameEngine');
const { isValidCard, isValidBid } = require('./validators');

function startNewRound(room, io) {
    room.gameState.status = 'BIDDING';

    const nb = Engine.getCardsCount(room.gameState.currentRound);
    const deck = Engine.createDeck();

    room.players.forEach(p => {
        p.hand = deck.splice(0, nb);
        p.bid = null;
        p.tricksWon = 0;

        io.to(p.id).emit('yourHand', p.hand);
    });

    room.gameState.trump = deck.length > 0 ? deck[0] : null;
    room.gameState.currentPlayerIndex =
        (room.gameState.dealerIndex + 1) % 4;
}

function placeBid(room, socketId, bidValue) {
    if (room.gameState.status !== 'BIDDING') return { ok: false };

    const player = room.players[room.gameState.currentPlayerIndex];
    if (!player || player.id !== socketId) return { ok: false };

    const nbCards = Engine.getCardsCount(room.gameState.currentRound);

    if (!isValidBid(bidValue, nbCards))
        return { ok: false, error: "Pari invalide." };

    player.bid = bidValue;
    room.gameState.currentPlayerIndex =
        (room.gameState.currentPlayerIndex + 1) % 4;

    if (room.players.every(p => p.bid !== null)) {
        room.gameState.status = 'PLAYING';
        room.gameState.currentPlayerIndex =
            (room.gameState.dealerIndex + 1) % 4;
    }

    return { ok: true };
}

function playCard(room, socketId, card) {
    if (room.gameState.status !== 'PLAYING') return { ok: false };
    if (room.gameState.table.length >= 4) return { ok: false };

    const player = room.players[room.gameState.currentPlayerIndex];
    if (!player || player.id !== socketId) return { ok: false };

    if (!isValidCard(card))
        return { ok: false, error: "Carte invalide." };

    const hasCard = player.hand.some(
        c => c.suit === card.suit && c.value === card.value
    );

    if (!hasCard)
        return { ok: false, error: "Carte invalide." };

    const trumpSuit = room.gameState.trump?.suit || null;

    if (!Engine.isMoveLegal(player.hand, card, room.gameState.table, trumpSuit))
        return { ok: false, error: "Coup illégal !" };

    room.gameState.table.push({
        playerId: player.userId,
        playerName: player.name,
        card
    });

    player.hand = player.hand.filter(
        c => !(c.suit === card.suit && c.value === card.value)
    );

    if (room.gameState.table.length === 4) {
        const winnerMove = Engine.evaluateTrick(
            room.gameState.table,
            trumpSuit
        );

        const winner = room.players.find(
            p => p.userId === winnerMove?.playerId
        );

        winner.tricksWon++;
        room.gameState.currentPlayerIndex =
            room.players.indexOf(winner);

        const isRoundOver =
            room.players.every(p => p.hand.length === 0);

        return {
            ok: true,
            trickCompleted: true,
            winnerName: winner.name,
            table: room.gameState.table,
            roundOver: isRoundOver
        };
    }

    room.gameState.currentPlayerIndex =
        (room.gameState.currentPlayerIndex + 1) % 4;

    return { ok: true };
}

function finishRound(room) {
    const roundRes = {
        round: room.gameState.currentRound,
        results: room.players.map(p => {
            const pts = Engine.calculatePoints(p.bid, p.tricksWon);
            p.score += pts;
            return { bid: p.bid, points: pts, total: p.score };
        })
    };

    room.gameState.scoreHistory.push(roundRes);
    room.gameState.currentRound++;
    room.gameState.dealerIndex =
        (room.gameState.dealerIndex + 1) % 4;

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
