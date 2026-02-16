require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const { roomManager: RoomManager } = require('./roomManager');
const { normalizeRoomId } = require('./validators');
const { serializeGameState } = require('./stateSerializer');
const GameService = require('./gameService');
const Engine = require('./gameEngine'); // utile pour nbCards dans certains messages

const app = express();

app.use(cors({
    origin: "*", // ⚠️ en prod: mets ton domaine (ex: https://tonsite.com)
    methods: ["GET", "POST"]
}));

// ==========================
// SUPABASE SERVER CLIENT
// ==========================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================
// ROUTES REST
// ==========================
app.get('/ping', (req, res) => res.status(200).send('pong'));

app.get('/rooms', (req, res) => {
    res.json(RoomManager.getPublicRooms());
});

// ==========================
// SOCKET.IO
// ==========================
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ==========================
// AUTH MIDDLEWARE
// ==========================
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('UNAUTHORIZED'));

        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) return next(new Error('UNAUTHORIZED'));

        socket.user = data.user;
        next();
    } catch {
        next(new Error('UNAUTHORIZED'));
    }
});

// ==========================
// HELPERS
// ==========================
function broadcast(roomId) {
    const room = RoomManager.getRoom(roomId);
    if (!room) return;
    io.to(roomId).emit('gameStateUpdate', serializeGameState(room));
}

/**
 * IMPORTANT:
 * - Le serveur ne fait aucun setTimeout.
 * - Le front anime, puis envoie ackTrickAnimation pour que le serveur reset la table.
 * - Même logique après roundFinished si tu veux animer: tu peux faire un ackRoundAnimation
 *   (pas obligatoire ici, on démarre le round direct après ackTrickAnimation).
 */

// ==========================
// SOCKET CONNECTION
// ==========================
io.on('connection', (socket) => {
    console.log(`📡 Connexion authentifiée : ${socket.user.email}`);

    // ==========================
    // JOIN ROOM
    // ==========================
    socket.on('joinRoom', ({ roomId }) => {
        const normalized = normalizeRoomId(roomId);
        if (!normalized) return socket.emit('error_message', "Room ID invalide.");

        const user = socket.user;
        const pseudo =
            user.user_metadata?.display_name ||
            user.email ||
            "Joueur";

        const result = RoomManager.createOrJoin(normalized, socket, {
            userId: user.id,
            pseudo
        });

        if (result.error) return socket.emit('error_message', result.error);

        const { room, player, isReconnection } = result;

        socket.join(room.id);

        // Si reconnexion => on renvoie la main
        if (isReconnection) {
            socket.emit('yourHand', player.hand);
        } else {
            // Si 4 joueurs et en attente => start round
            if (room.players.length === 4 && room.gameState.status === 'WAITING') {
                GameService.startNewRound(room, io);
            }
        }

        broadcast(room.id);
    });

    // ==========================
    // PLACE BID
    // ==========================
    socket.on('placeBid', (bidValue) => {
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room) return;

        // (Optionnel) Interdire si joueur offline / game pas dans l'état
        const res = GameService.placeBid(room, socket.id, bidValue);

        if (!res.ok && res.error) {
            return socket.emit('error_message', res.error);
        }

        // Si tu veux ré-afficher nbCards côté front même en bidding:
        // (déjà inclus via serializeGameState)
        broadcast(room.id);
    });

    // ==========================
    // PLAY CARD
    // ==========================
    socket.on('playCard', (card) => {
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room) return;

        const res = GameService.playCard(room, socket.id, card);

        if (!res.ok && res.error) {
            return socket.emit('error_message', res.error);
        }

        // Broadcast immédiat de l'état après action
        broadcast(room.id);

        // Si pli terminé => on émet un event spécifique pour que le front anime
        if (res.trickCompleted) {
            io.to(room.id).emit('trickResolved', {
                winnerName: res.winnerName,
                table: res.table,
                roundOver: res.roundOver
            });
            // NOTE: la table reste en mémoire tant que le front n'a pas ack.
            // Le front doit ensuite appeler ackTrickAnimation.
        }
    });

    // ==========================
    // ACK: FIN ANIMATION DE PLI
    // ==========================
    socket.on('ackTrickAnimation', () => {
        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room) return;

        // Sécurité minimale: si pas de pli complet affiché, ignore
        if (!Array.isArray(room.gameState.table) || room.gameState.table.length !== 4) {
            return;
        }

        // Reset table
        room.gameState.table = [];

        // Si round terminé (toutes les mains vides) => calcul points + manche suivante
        const isRoundOver = room.players.every(p => p.hand.length === 0);

        if (isRoundOver) {
            const res = GameService.finishRound(room);

            // On notifie les résultats de la manche (scoreHistory dernier élément)
            const last = room.gameState.scoreHistory[room.gameState.scoreHistory.length - 1];
            io.to(room.id).emit('roundFinished', {
                round: last?.round,
                results: last?.results,
                nextRound: !res.gameOver
            });

            if (res.gameOver) {
                io.to(room.id).emit('gameOver', room.players);
                // status déjà FINISHED côté service
                broadcast(room.id);
                return;
            }

            // Démarre la manche suivante immédiatement (sans timeout)
            GameService.startNewRound(room, io);
        }

        broadcast(room.id);
    });

    // ==========================
    // DISCONNECT
    // ==========================
    socket.on('disconnect', () => {
        const roomId = RoomManager.handleDisconnect(socket);
        if (roomId) broadcast(roomId);
    });
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🃏 SERVEUR WHIST OPÉRATIONNEL SUR LE PORT ${PORT}`);
});
