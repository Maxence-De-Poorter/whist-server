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
        origin: "*", // ⚠️ À restreindre en production
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

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
        if (!roomId || !pseudo) {
            return socket.emit('error_message', "Paramètres invalides.");
        }

        const result = RoomManager.createOrJoin(roomId, socket, pseudo);
        if (result.error) return socket.emit('error_message', result.error);

        const { room, player, isReconnection } = result;
        socket.join(room.id);

        if (isReconnection) {
            socket.emit('yourHand', player.hand);
            socket.emit('tableUpdate', { table: room.gameState.table });
        }
        else if (room.players.length === 4 && room.gameState.status === 'WAITING') {
            startNewRound(room);
        }

        broadcast(room.id);
    });

    // --- PARIS ---
    socket.on('placeBid', (bidValue) => {
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);

        if (!room || room.gameState.status !== 'BIDDING') return;

        const player = room.players[room.gameState.currentPlayerIndex];
        if (!player || player.id !== socket.id) return;

        const nbCards = Engine.getCardsCount(room.gameState.currentRound);

        // ✅ Validation stricte
        if (
            typeof bidValue !== 'number' ||
            bidValue < 0 ||
            bidValue > nbCards
        ) {
            return socket.emit('error_message', "Pari invalide.");
        }

        const bidsSoFar = room.players
            .filter(p => p.bid !== null)
            .map(p => p.bid);

        const forbidden = Engine.getForbiddenBid(nbCards, bidsSoFar);

        if (forbidden !== null && bidValue === forbidden) {
            return socket.emit(
                'error_message',
                `Pari interdit ! Le total ne doit pas être égal à ${nbCards}.`
            );
        }

        player.bid = bidValue;
        room.gameState.currentPlayerIndex =
            (room.gameState.currentPlayerIndex + 1) % 4;

        if (room.players.every(p => p.bid !== null)) {
            room.gameState.status = 'PLAYING';
            room.gameState.currentPlayerIndex =
                (room.gameState.dealerIndex + 1) % 4;
        }

        broadcast(roomId);
    });

    // --- JOUER UNE CARTE ---
    socket.on('playCard', (card) => {
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);

        if (!room ||
            room.gameState.status !== 'PLAYING' ||
            room.gameState.table.length >= 4
        ) return;

        const player = room.players[room.gameState.currentPlayerIndex];
        if (!player || player.id !== socket.id) return;

        // Vérification possession carte
        const hasCard = player.hand.some(
            c => c.suit === card?.suit && c.value === card?.value
        );

        if (!hasCard) {
            return socket.emit('error_message', "Carte invalide.");
        }

        const trumpSuit = room.gameState.trump?.suit || 'SA';

        if (!Engine.isMoveLegal(
            player.hand,
            card,
            room.gameState.table,
            trumpSuit
        )) {
            return socket.emit(
                'error_message',
                "Coup illégal ! Vous devez fournir ou couper."
            );
        }

        room.gameState.table.push({
            playerName: player.name,
            card
        });

        player.hand = player.hand.filter(
            c => !(c.suit === card.suit && c.value === card.value)
        );

        // --- FIN DE PLI ---
        if (room.gameState.table.length === 4) {

            broadcast(roomId);

            const winnerMove = Engine.evaluateTrick(
                room.gameState.table,
                trumpSuit
            );

            const winner = room.players.find(
                p => p.name === winnerMove?.playerName
            );

            if (!winner) return; // sécurité

            winner.tricksWon++;
            room.gameState.currentPlayerIndex =
                room.players.indexOf(winner);

            io.to(roomId).emit('trickOver', {
                winnerName: winner.name,
                table: room.gameState.table
            });

            const isRoundOver =
                room.players.every(p => p.hand.length === 0);

            setTimeout(() => {
                // 🔒 Vérifier que la room existe toujours
                if (!RoomManager.getRoom(roomId)) return;

                room.gameState.table = [];

                if (isRoundOver) finishRound(room);
                else broadcast(roomId);

            }, 2500);

        } else {
            room.gameState.currentPlayerIndex =
                (room.gameState.currentPlayerIndex + 1) % 4;

            broadcast(roomId);
        }
    });

    // --- DÉCONNEXION ---
    socket.on('disconnect', () => {
        const roomId = RoomManager.handleDisconnect(socket, io);
        if (roomId) broadcast(roomId);
    });
});


// ==============================
// HELPERS DU JEU
// ==============================

function startNewRound(room) {
    if (!room) return;

    room.gameState.status = 'BIDDING';

    const nb = Engine.getCardsCount(room.gameState.currentRound);
    const deck = Engine.createDeck();

    room.players.forEach(p => {
        p.hand = deck.splice(0, nb);
        p.bid = null;
        p.tricksWon = 0;

        io.to(p.id).emit('yourHand', p.hand);
    });

    room.gameState.trump =
        deck.length > 0
            ? deck[0]
            : { suit: 'SA', value: 'Sans Atout' };

    room.gameState.currentPlayerIndex =
        (room.gameState.dealerIndex + 1) % 4;

    broadcast(room.id);
}

function finishRound(room) {
    if (!room) return;

    const roundRes = {
        round: room.gameState.currentRound,
        results: room.players.map(p => {
            const pts = Engine.calculatePoints(p.bid, p.tricksWon);
            p.score += pts;

            return {
                bid: p.bid,
                points: pts,
                total: p.score
            };
        })
    };

    room.gameState.scoreHistory.push(roundRes);
    room.gameState.currentRound++;
    room.gameState.dealerIndex =
        (room.gameState.dealerIndex + 1) % 4;

    setTimeout(() => {

        if (!RoomManager.getRoom(room.id)) return;

        if (room.gameState.currentRound <= 18) {
            startNewRound(room);
        } else {
            io.to(room.id).emit('gameOver', room.players);
            room.gameState.status = 'FINISHED';
        }

    }, 4000);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () =>
    console.log(`🃏 SERVEUR WHIST OPÉRATIONNEL SUR LE PORT ${PORT}`)
);
