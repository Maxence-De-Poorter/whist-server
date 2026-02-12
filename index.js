/**
 * @file index.js
 * @description Point d’entrée du serveur du jeu de Whist : gestion des connexions Socket.IO,
 * rooms, tours de jeu et synchronisation de l’état entre clients.
 */

'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const RoomManager = require('./roomManager');
const Engine = require('./gameEngine');

// ==============================
// CONFIGURATION DE BASE
// ==============================
const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS || '*', // ⚠️ À restreindre en production
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ==============================
// BROADCAST UTILITAIRE
// ==============================

/**
 * Diffuse l'état complet d'une room à tous ses membres.
 * @param {string} roomId - Identifiant de la room
 */
function broadcast(roomId) {
    const room = RoomManager.getRoom(roomId);
    if (!room) return;

    const { gameState, players } = room;
    io.to(roomId).emit('gameStateUpdate', {
        ...gameState,
        nbCards: Engine.getCardsCount(gameState.currentRound),
        currentPlayer: players[gameState.currentPlayerIndex]?.id,
        players: players.map(({ id, name, bid, tricksWon, score, online }) => ({
            id, name, bid, tricksWon, score, online
        }))
    });
}

// ==============================
// GESTION DES SOCKETS
// ==============================

io.on('connection', (socket) => {
    console.log(`📡 Nouvelle connexion : ${socket.id}`);

    // --- JOINDRE / CRÉER UNE ROOM ---
    socket.on('joinRoom', ({ roomId, pseudo }) => {
        if (!roomId || !pseudo) {
            return socket.emit('error_message', 'Paramètres invalides.');
        }

        const result = RoomManager.createOrJoin(roomId, socket, pseudo);
        if (result.error) return socket.emit('error_message', result.error);

        const { room, player, isReconnection } = result;
        socket.join(room.id);

        if (isReconnection) {
            socket.emit('yourHand', player.hand);
            socket.emit('tableUpdate', { table: room.gameState.table });
        } else if (room.players.length === 4 && room.gameState.status === 'WAITING') {
            startNewRound(room);
        }

        broadcast(room.id);
    });

    // --- PARIS (BIDDING) ---
    socket.on('placeBid', (bidValue) => {
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room || room.gameState.status !== 'BIDDING') return;

        const player = room.players[room.gameState.currentPlayerIndex];
        if (!player || player.id !== socket.id) return;

        const nbCards = Engine.getCardsCount(room.gameState.currentRound);

        if (typeof bidValue !== 'number' || bidValue < 0 || bidValue > nbCards) {
            return socket.emit('error_message', 'Pari invalide.');
        }

        const bidsSoFar = room.players.filter(p => p.bid !== null).map(p => p.bid);
        const forbidden = Engine.getForbiddenBid(nbCards, bidsSoFar);

        if (forbidden !== null && bidValue === forbidden) {
            return socket.emit('error_message', `Pari interdit ! Le total ne doit pas être égal à ${nbCards}.`);
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
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room || room.gameState.status !== 'PLAYING' || room.gameState.table.length >= 4) return;

        const player = room.players[room.gameState.currentPlayerIndex];
        if (!player || player.id !== socket.id) return;

        // Vérifier la possession de la carte
        const hasCard = player.hand.some(c => c.suit === card?.suit && c.value === card?.value);
        if (!hasCard) return socket.emit('error_message', 'Carte invalide.');

        const trumpSuit = room.gameState.trump?.suit || 'SA';

        if (!Engine.isMoveLegal(player.hand, card, room.gameState.table, trumpSuit)) {
            return socket.emit('error_message', 'Coup illégal ! Vous devez fournir ou couper.');
        }

        // Jouer la carte
        room.gameState.table.push({ playerName: player.name, card });
        player.hand = player.hand.filter(c => !(c.suit === card.suit && c.value === card.value));

        // Si le pli est complet (4 cartes)
        if (room.gameState.table.length === 4) {
            broadcast(roomId);

            const winnerMove = Engine.evaluateTrick(room.gameState.table, trumpSuit);
            const winner = room.players.find(p => p.name === winnerMove?.playerName);
            if (!winner) return;

            winner.tricksWon++;
            room.gameState.currentPlayerIndex = room.players.indexOf(winner);

            io.to(roomId).emit('trickOver', {
                winnerName: winner.name,
                table: room.gameState.table
            });

            const roundOver = room.players.every(p => p.hand.length === 0);

            setTimeout(() => {
                if (!RoomManager.getRoom(roomId)) return;
                room.gameState.table = [];

                roundOver ? finishRound(room) : broadcast(roomId);
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

// ==============================
// HELPERS DU JEU
// ==============================

/**
 * Démarre une nouvelle manche : distribue, choisit l’atout et initialise les états.
 */
function startNewRound(room) {
    if (!room) return;

    room.gameState.status = 'BIDDING';

    const nbCards = Engine.getCardsCount(room.gameState.currentRound);
    const deck = Engine.createDeck();

    room.players.forEach(p => {
        p.hand = deck.splice(0, nbCards);
        p.bid = null;
        p.tricksWon = 0;
        io.to(p.id).emit('yourHand', p.hand);
    });

    room.gameState.trump = deck.length > 0
        ? deck[0]
        : { suit: 'SA', value: 'Sans Atout' };

    room.gameState.currentPlayerIndex = (room.gameState.dealerIndex + 1) % 4;
    broadcast(room.id);
}

/**
 * Termine une manche : calcule les scores, met à jour l’historique et enchaîne ou termine la partie.
 */
function finishRound(room) {
    if (!room) return;

    const results = room.players.map(p => {
        const points = Engine.calculatePoints(p.bid, p.tricksWon);
        p.score += points;
        return { bid: p.bid, points, total: p.score };
    });

    room.gameState.scoreHistory.push({
        round: room.gameState.currentRound,
        results
    });

    room.gameState.currentRound++;
    room.gameState.dealerIndex = (room.gameState.dealerIndex + 1) % 4;

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

// ==============================
// DÉMARRAGE DU SERVEUR
// ==============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
    console.log(`🃏 Serveur Whist opérationnel sur le port ${PORT}`)
);
