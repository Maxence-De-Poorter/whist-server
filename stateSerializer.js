const Engine = require('./gameEngine');

function serializeGameState(room) {
    const currentPlayer =
        room.players[room.gameState.currentPlayerIndex];

    return {
        roomId: room.id,
        ...room.gameState,
        nbCards: Engine.getCardsCount(room.gameState.currentRound),
        currentPlayerUserId: currentPlayer?.userId,
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
