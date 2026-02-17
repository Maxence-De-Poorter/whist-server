require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const { roomManager: RoomManager } = require('./roomManager');
const { normalizeRoomId } = require('./validators');
const { serializeGameState } = require('./stateSerializer');
const GameService = require('./gameService');

const app = express();

// ==========================
// SECURITY MIDDLEWARE
// ==========================

app.use(helmet());

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
}));

app.use(cors({
    origin: true
}));



// ==========================
// SUPABASE SERVER CLIENT
// ==========================

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables missing');
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================
// REST ROUTES
// ==========================

app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/rooms', (req, res) =>
    res.json(RoomManager.getPublicRooms())
);

// ==========================
// SOCKET.IO SETUP
// ==========================

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});



// ==========================
// SOCKET RATE LIMIT
// ==========================

const RATE_LIMIT_WINDOW = 1000;
const MAX_ACTIONS_PER_WINDOW = 8;
const actionTracker = new Map();

function isRateLimited(socket) {
    const now = Date.now();
    const data = actionTracker.get(socket.id);

    if (!data) {
        actionTracker.set(socket.id, { count: 1, timestamp: now });
        return false;
    }

    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
        actionTracker.set(socket.id, { count: 1, timestamp: now });
        return false;
    }

    data.count++;
    return data.count > MAX_ACTIONS_PER_WINDOW;
}

// Nettoyage automatique anti memory leak
setInterval(() => {
    const now = Date.now();
    actionTracker.forEach((data, socketId) => {
        if (now - data.timestamp > RATE_LIMIT_WINDOW) {
            actionTracker.delete(socketId);
        }
    });
}, 5000);

// ==========================
// AUTH MIDDLEWARE
// ==========================

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('UNAUTHORIZED'));

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            return next(new Error('UNAUTHORIZED'));
        }

        socket.user = data.user;
        next();
    } catch {
        next(new Error('UNAUTHORIZED'));
    }
});

// ==========================
// BROADCAST
// ==========================

function broadcast(roomId) {
    const room = RoomManager.getRoom(roomId);
    if (!room) return;

    RoomManager.touch(room);

    io.to(roomId).emit(
        'gameStateUpdate',
        serializeGameState(room)
    );
}

// ==========================
// SOCKET EVENTS
// ==========================

io.on('connection', (socket) => {

    socket.on('joinRoom', ({ roomId }) => {
        if (isRateLimited(socket)) return;

        const normalized = normalizeRoomId(roomId);
        if (!normalized)
            return socket.emit('error_message', 'Room ID invalide.');

        const user = socket.user;

        const pseudo =
            user.user_metadata?.display_name ||
            user.email ||
            'Joueur';

        const result = RoomManager.createOrJoin(
            normalized,
            socket,
            { userId: user.id, pseudo }
        );

        if (result.error)
            return socket.emit('error_message', result.error);

        const { room, player, isReconnection } = result;

        socket.join(room.id);

        if (isReconnection) {
            socket.emit('yourHand', player.hand);
        } else if (
            room.players.length === 4 &&
            room.gameState.status === 'WAITING'
        ) {
            GameService.startNewRound(room, io);
        }

        broadcast(room.id);
    });

    socket.on('placeBid', (bidValue) => {
        if (isRateLimited(socket)) return;

        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room) return;

        const res = GameService.placeBid(
            room,
            socket.id,
            bidValue
        );

        if (!res.ok && res.error)
            return socket.emit('error_message', res.error);

        broadcast(room.id);
    });

    socket.on('playCard', (card) => {
        if (isRateLimited(socket)) return;

        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room) return;

        const res = GameService.playCard(
            room,
            socket.id,
            card
        );

        if (!res.ok && res.error)
            return socket.emit('error_message', res.error);

        broadcast(room.id);

        if (res.trickCompleted) {
            room.gameState.pendingTrickAcks = new Set();

            io.to(room.id).emit('trickResolved', {
                winnerName: res.winnerName,
                table: res.table,
                roundOver: res.roundOver
            });
        }
    });

    socket.on('ackTrickAnimation', () => {
        if (isRateLimited(socket)) return;

        const roomId = RoomManager.socketToRoom.get(socket.id);
        const room = RoomManager.getRoom(roomId);
        if (!room) return;

        const player = room.players.find(
            (p) => p.id === socket.id
        );
        if (!player || !player.online) return;

        if (!room.gameState.pendingTrickAcks) {
            room.gameState.pendingTrickAcks = new Set();
        }

        room.gameState.pendingTrickAcks.add(player.userId);

        if (
            room.gameState.pendingTrickAcks.size <
            room.players.length
        ) {
            return;
        }

        room.gameState.pendingTrickAcks.clear();

        const isRoundOver = room.players.every(
            (p) => p.hand.length === 0
        );

        if (isRoundOver) {
            const res = GameService.finishRound(room);

            const last =
                room.gameState.scoreHistory.at(-1);

            io.to(room.id).emit('roundFinished', {
                round: last?.round,
                results: last?.results,
                nextRound: !res.gameOver
            });

            if (res.gameOver) {
                io.to(room.id).emit('gameOver', room.players);
                broadcast(room.id);
                return;
            }

            GameService.startNewRound(room, io);
        }

        broadcast(room.id);
    });

    socket.on('disconnect', () => {
        actionTracker.delete(socket.id);
        const roomId = RoomManager.handleDisconnect(socket);
        if (roomId) broadcast(roomId);
    });
});

// ==========================
// START SERVER
// ==========================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () =>
    console.log(`🃏 WHIST SERVER RUNNING ON PORT ${PORT}`)
);
