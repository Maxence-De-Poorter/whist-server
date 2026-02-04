const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const RoomManager = require('./roomManager');
const Engine = require('./gameEngine');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // À remplacer par ton URL de production (Vercel/Netlify)
        methods: ["GET", "POST"],
        pingTimeout: 60000,  // 1 minute : Temps d'attente sans réponse avant de déconnecter
        pingInterval: 25000  // 25s : Fréquence à laquelle le serveur envoie un "ping"
    }
});

/**
 * Utilitaire : Récupère l'ID de la room du socket de manière fiable
 */
function getSocketRoom(socket) {
    return Array.from(socket.rooms).find(r => r !== socket.id);
}

/**
 * Diffuse l'état complet de la partie aux membres d'une room
 */
function broadcast(roomId) {
    const room = RoomManager.getRoom(roomId);
    if (!room) return;
    io.to(roomId).emit('gameStateUpdate', {
        ...room.gameState,
        nbCards: Engine.getCardsCount(room.gameState.currentRound),
        currentPlayer: room.players[room.gameState.currentPlayerIndex]?.id,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            bid: p.bid,
            tricksWon: p.tricksWon,
            score: p.score,
            online: p.online
        }))
    });
}

io.on('connection', (socket) => {
    console.log(`📡 Connexion : ${socket.id}`);

    // --- REJOINDRE ---
    socket.on('joinRoom', ({ roomId, pseudo }) => {
        const result = RoomManager.createOrJoin(roomId, socket, pseudo);
        if (result.error) return socket.emit('error_message', result.error);

        const { room, player, isReconnection } = result;
        socket.join(room.id);

        if (isReconnection) {
            socket.emit('yourHand', player.hand);
            // SYNC : On renvoie l'état actuel de la table pour que le joueur ne voie pas un tapis vide
            socket.emit('tableUpdate', { table: room.gameState.table });
        } else if (room.players.length === 4) {
            startNewRound(room);
        }
        broadcast(room.id);
    });

    // --- PARIS (BIDDING) ---
    socket.on('placeBid', (bidValue) => {
        const roomId = getSocketRoom(socket);
        const room = RoomManager.getRoom(roomId);
        if (!room || room.gameState.status !== 'BIDDING') return;

        const player = room.players[room.gameState.currentPlayerIndex];
        if (player?.id !== socket.id) return;

        const bidsSoFar = room.players.filter(p => p.bid !== null).map(p => p.bid);
        const nbCards = Engine.getCardsCount(room.gameState.currentRound);
        const forbidden = Engine.getForbiddenBid(nbCards, bidsSoFar);

        if (forbidden !== null && bidValue === forbidden) {
            return socket.emit('error_message', `Pari interdit ! Le total du round ne doit pas être égal à ${nbCards}.`);
        }

        player.bid = bidValue;
        room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % 4;

        if (room.players.every(p => p.bid !== null)) {
            room.gameState.status = 'PLAYING';
            room.gameState.currentPlayerIndex = (room.gameState.dealerIndex + 1) % 4;
        }
        broadcast(roomId);
    });

    // --- JOUER UNE CARTE ---
    socket.on('playCard', (card) => {
        const roomId = getSocketRoom(socket);
        const room = RoomManager.getRoom(roomId);

        if (!room || room.gameState.status !== 'PLAYING' || room.gameState.table.length >= 4) return;

        const player = room.players[room.gameState.currentPlayerIndex];
        if (player?.id !== socket.id) return;

        // SÉCURITÉ : Vérifier que le joueur possède réellement la carte
        const hasCard = player.hand.some(c => c.suit === card.suit && c.value === card.value);
        if (!hasCard) {
            return socket.emit('error_message', "Vous n'avez pas cette carte en main !");
        }

        // Vérification des règles (Fournir ou Couper)
        if (!Engine.isMoveLegal(player.hand, card, room.gameState.table, room.gameState.trump.suit)) {
            return socket.emit('error_message', "Coup illégal ! Vous devez fournir la couleur ou couper !");
        }

        room.gameState.table.push({ playerId: socket.id, card });
        player.hand = player.hand.filter(c => !(c.suit === card.suit && c.value === card.value));

        if (room.gameState.table.length === 4) {
            broadcast(roomId);
            const winnerMove = Engine.evaluateTrick(room.gameState.table, room.gameState.trump.suit);
            const winner = room.players.find(p => p.id === winnerMove.playerId);
            winner.tricksWon++;
            room.gameState.currentPlayerIndex = room.players.indexOf(winner);

            io.to(roomId).emit('trickOver', { winnerName: winner.name, table: room.gameState.table });

            setTimeout(() => {
                room.gameState.table = [];
                if (player.hand.length === 0) finishRound(room);
                else broadcast(roomId);
            }, 2500);
        } else {
            room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % 4;
            broadcast(roomId);
        }
    });

    // --- DÉCONNEXION ---
    socket.on('disconnect', () => {
        const roomId = RoomManager.handleDisconnect(socket, io);
        if (roomId) broadcast(roomId);
    });
});

// --- HELPERS DU JEU ---

function startNewRound(room) {
    room.gameState.status = 'BIDDING';
    const nb = Engine.getCardsCount(room.gameState.currentRound);
    const deck = Engine.createDeck();

    room.players.forEach(p => {
        p.hand = deck.splice(0, nb);
        p.bid = null;
        p.tricksWon = 0;
        io.to(p.id).emit('yourHand', p.hand);
    });

    // Atout : dernière carte du donneur si le paquet est vide (Rounds à 8 cartes)
    if (deck.length > 0) {
        room.gameState.trump = deck[0];
    } else {
        const dealer = room.players[room.gameState.dealerIndex];
        const lastCard = dealer.hand[dealer.hand.length - 1];
        room.gameState.trump = { suit: lastCard.suit, value: lastCard.value };
    }

    room.gameState.currentPlayerIndex = (room.gameState.dealerIndex + 1) % 4;
    broadcast(room.id);
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
    room.gameState.dealerIndex = (room.gameState.dealerIndex + 1) % 4;

    // TEMPO : On laisse 4 secondes aux joueurs pour voir les scores avant la nouvelle donne
    setTimeout(() => {
        if (room.gameState.currentRound <= 18) {
            startNewRound(room);
        } else {
            io.to(room.id).emit('gameOver', room.players);
            room.gameState.status = 'FINISHED';
        }
    }, 4000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 SERVEUR WHIST OPÉRATIONNEL SUR LE PORT ${PORT}`));