const Engine = require('./gameEngine');

function serializeGameState(room) {
    if (!room || !room.gameState || !Array.isArray(room.players)) {
        return null;
    }

    const {
        currentRound,
        dealerIndex,
        currentPlayerIndex,
        status,
        trump,
        table,
        scoreHistory
    } = room.gameState;

    const currentPlayer =
        room.players[currentPlayerIndex] || null;

    return {
        roomId: room.id,

        // --- Etat de jeu exposé ---
        status,
        currentRound,
        dealerIndex,
        currentPlayerIndex,
        currentPlayerUserId: currentPlayer?.userId || null,

        trump: trump
            ? { suit: trump.suit, value: trump.value }
            : null,

        table: Array.isArray(table)
            ? table.map(move => ({
                playerId: move.playerId,
                playerName: move.playerName,
                card: {
                    suit: move.card.suit,
                    value: move.card.value
                }
            }))
            : [],

        scoreHistory: Array.isArray(scoreHistory)
            ? [...scoreHistory]
            : [],

        nbCards: Engine.getCardsCount(currentRound),

        players: room.players.map(p => ({
            userId: p.userId,
            name: p.name,
            bid: p.bid,
            tricksWon: p.tricksWon,
            score: p.score,
            online: p.online
        }))
    };
}

module.exports = { serializeGameState };
